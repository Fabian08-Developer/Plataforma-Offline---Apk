import { useEffect, useState, useRef } from 'react';
import { dbService } from '../db';
import { Wifi, AlertTriangle, X } from 'lucide-react';
import UpdateModal from './UpdateModal';
import { APP_VERSION, BACKEND_URL } from '../config';
import { reconciliarEncuestasEliminadas } from '../services/reconciliation';

/** Encuestas por petición de sincronización (el backend acepta hasta 200) */
const LOTE_SYNC = 100;

type AdvertenciaDuplicado = {
  documento_identidad: string;
  /** Si es ajeno, el servidor no envía datos personales: solo el motivo */
  similares: Array<{ documento_identidad: string; nombres: string; apellidos: string; razon: string; ajeno?: boolean }>;
};

/**
 * Verifica si el backend es alcanzable con un timeout breve.
 * Evita ERR_CONNECTION_REFUSED en consola cuando el servidor local no está corriendo.
 */
async function isBackendReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // Aumentado a 6s para redes móviles lentas
    await fetch(`${BACKEND_URL}/api/version`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

export default function SyncService() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [updateData, setUpdateData] = useState<{ versionMinima: string, urlDescarga: string, descripcion: string, esObligatorio: boolean } | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<AdvertenciaDuplicado[]>([]);
  const [showSyncWarning, setShowSyncWarning] = useState(false);
  /** Cache de alcanzabilidad: evita múltiples HEAD requests en el mismo ciclo */
  const backendReachableRef = useRef<boolean | null>(null);
  /**
   * Guarda contra sincronizaciones simultáneas. Va en un ref (no en el estado `syncing`) porque los
   * listeners se registran una sola vez y verían siempre el valor inicial del estado.
   */
  const syncingRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('trigger-sync', syncPendingData);

    // Initial check
    const initialTimer = setTimeout(() => {
      if (navigator.onLine) {
        syncPendingData();
      }
    }, 1000);

    // Periodic check every 20 seconds.
    // IMPORTANTE: En Android WebView, navigator.onLine puede quedarse en false después de
    // volver de modo avión/sin señal. Por eso intentamos siempre — isBackendReachable() lo
    // valida de forma fiable con una petición HEAD real al servidor.
    const intervalTimer = setInterval(() => {
      syncPendingData();
    }, 20000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('trigger-sync', syncPendingData);
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  /** Aplica la respuesta de un lote: marca como sincronizadas, purga eliminadas y registra advertencias */
  const aplicarRespuesta = async (data: any) => {
    if (Array.isArray(data.sincronizadas)) {
      for (const entry of data.sincronizadas) {
        await dbService.markAsSynchronized(entry.localId, entry.documento_identidad, {
          telefono_1: entry.telefono_1,
          telefono_2: entry.telefono_2,
          telefono_3: entry.telefono_3,
        });
      }
    }

    // Encuestas que el administrador eliminó en el servidor: se purgan del dispositivo
    if (Array.isArray(data.eliminadas) && data.eliminadas.length > 0) {
      for (const elim of data.eliminadas) {
        if (elim.localId) await dbService.deleteSurvey(elim.localId);
        if (elim.documento_identidad) await dbService.deleteSurveyByDocumento(elim.documento_identidad);
      }
      console.log(`[Sync] Se purgaron ${data.eliminadas.length} encuesta(s) eliminada(s) por el administrador.`);
    }

    // Conflictos: el servidor tenía una modificación más reciente y conservó sus datos
    if (Array.isArray(data.conflictos) && data.conflictos.length > 0) {
      console.warn('[Sync] Conflictos resueltos a favor del servidor (más reciente):', data.conflictos);
    }

    // Posibles duplicados detectados al crear las encuestas en el servidor
    if (Array.isArray(data.advertencias) && data.advertencias.length > 0) {
      const total = data.advertencias.reduce((acc: number, a: any) => acc + (a.similares?.length || 0), 0);
      console.warn(`⚠️ Sincronización: se detectaron ${total} posible(s) duplicado(s).`, data.advertencias);
      setSyncWarnings((prev) => [...prev, ...data.advertencias]);
      setShowSyncWarning(true);
    }
  };

  /** Envía las encuestas pendientes en lotes. Se detiene ante el primer error para reintentar en el siguiente ciclo */
  const enviarPendientes = async (pendientes: Awaited<ReturnType<typeof dbService.getPendingSurveys>>, token: string) => {
    for (let i = 0; i < pendientes.length; i += LOTE_SYNC) {
      const lote = pendientes.slice(i, i + LOTE_SYNC);
      const res = await fetch(`${BACKEND_URL}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ encuestas: lote }),
      });

      if (res.status === 401 || res.status === 403) {
        console.warn('La sesión ya no es válida. Inicie sesión con conexión para sincronizar.');
        return;
      }
      if (!res.ok) {
        console.warn('El servidor respondió con error al sincronizar:', res.status);
        return;
      }

      await aplicarRespuesta(await res.json());
      window.dispatchEvent(new Event('surveys-updated'));
    }
  };

  const syncPendingData = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      // Privacidad: un encuestador no conserva copias locales de encuestas de otros encuestadores
      const sesion = JSON.parse(localStorage.getItem('auth_user') || 'null');
      if (sesion?.rol === 'encuestador' && sesion?.usuario) {
        await dbService.deleteSyncedNotOwned(sesion.usuario);
      }

      // Verificar alcanzabilidad real del backend antes de intentar fetch
      const reachable = await isBackendReachable();
      backendReachableRef.current = reachable;

      if (!reachable) {
        // Backend no disponible — modo offline silencioso, sin spam en consola
        return;
      }

      const token = localStorage.getItem('auth_token');

      // Reconciliación: purgar de SQLite local las encuestas sincronizadas que el administrador eliminó
      const purged = await reconciliarEncuestasEliminadas(token);
      if (purged > 0) {
        console.log(`[SyncService] Se purgaron ${purged} encuesta(s) eliminada(s) del servidor central.`);
        window.dispatchEvent(new Event('surveys-updated'));
      }

      const pendingSurveys = await dbService.getPendingSurveys();
      if (pendingSurveys.length > 0) {
        if (!token) {
          // Sesión iniciada sin conexión: no hay token para autenticar. Las encuestas quedan pendientes.
          console.info('Hay encuestas pendientes. Inicie sesión con conexión para sincronizarlas.');
        } else {
          setSyncing(true);
          console.log(`Sincronizando ${pendingSurveys.length} encuestas con el servidor...`);
          await enviarPendientes(pendingSurveys, token);
        }
      }
    } catch (error) {
      console.warn('Error durante la sincronización:', error);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }

    // --- Revisar actualizaciones de versión de forma silenciosa ---
    try {
      const response = await fetch(`${BACKEND_URL}/api/version`);
      if (response.ok) {
        const data = await response.json();
        if (data.version_minima && data.version_minima.localeCompare(APP_VERSION, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
          const skippedVersion = localStorage.getItem('skipped_update');
          if (!data.esObligatorio && skippedVersion === data.version_minima) {
            console.log('Actualización opcional ya omitida previamente.');
          } else {
            setUpdateData({
              versionMinima: data.version_minima,
              urlDescarga: data.url_descarga,
              descripcion: data.descripcion,
              esObligatorio: data.esObligatorio
            });
          }
        }
      }
    } catch {
      // Silencioso: ya verificamos alcanzabilidad arriba
    }
  };

  const handleSkip = () => {
    if (updateData) {
      localStorage.setItem('skipped_update', updateData.versionMinima);
      setUpdateData(null);
    }
  };

  if (updateData) {
    return (
      <UpdateModal
        versionMinima={updateData.versionMinima}
        urlDescarga={updateData.urlDescarga}
        descripcion={updateData.descripcion}
        esObligatorio={updateData.esObligatorio}
        onSkip={handleSkip}
      />
    );
  }

  return (
    <>
      {/* ── Indicador de estado (Offline / Sincronizando) ────────────────── */}
      {(!isOnline || syncing) && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          zIndex: 9999,
          background: syncing ? 'var(--primary)' : 'var(--danger)',
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '99px',
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: 'var(--shadow-md)',
          animation: 'fadeIn 0.3s'
        }}>
          <Wifi size={14} />
          {syncing ? 'Sincronizando con base de datos...' : 'Modo Offline'}
        </div>
      )}

      {/* ── Banner de advertencia de posibles duplicados post-sync ───────── */}
      {showSyncWarning && syncWarnings.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          background: 'var(--surface)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '1.25rem',
          maxWidth: '460px',
          width: 'calc(100% - 2rem)',
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'hidden',
          animation: 'modalCardIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{ height: '3px', background: 'linear-gradient(90deg, #f59e0b, #ef4444)' }} />
          <div style={{ padding: '1.1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(239,68,68,0.12))',
                border: '1px solid rgba(245,158,11,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={20} color="#f59e0b" />
              </div>

              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                  Posibles duplicados detectados al sincronizar
                </p>
                <p style={{ margin: '0.25rem 0 0.7rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {syncWarnings.length === 1
                    ? 'Se sincronizó 1 encuesta que coincide estrechamente con registros en el servidor.'
                    : `Se sincronizaron ${syncWarnings.length} encuestas que coinciden estrechamente con registros en el servidor.`}
                </p>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.65rem',
                  padding: '0.65rem 0.85rem'
                }}>
                  {syncWarnings.map((warn, i) => (
                    <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                      <span style={{ color: '#d97706', fontWeight: 700, fontFamily: 'monospace' }}>Doc {warn.documento_identidad}</span>
                      {' '}→ coincide con:{' '}
                      {warn.similares.map((s, j) => (
                        <span key={j} style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                          {s.ajeno ? s.razon : `${s.nombres} ${s.apellidos} (${s.documento_identidad})`}{j < warn.similares.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSyncWarning(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.3rem',
                  borderRadius: '50%',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease'
                }}
                title="Cerrar notificación"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
