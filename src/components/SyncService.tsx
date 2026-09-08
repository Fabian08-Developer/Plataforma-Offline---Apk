import { useEffect, useState, useRef } from 'react';
import { dbService } from '../db';
import { Wifi, AlertTriangle, X } from 'lucide-react';
import UpdateModal from './UpdateModal';
import { APP_VERSION, BACKEND_URL } from '../config';

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
  const [syncWarnings, setSyncWarnings] = useState<Array<{ documento_identidad: string; similares: Array<{ documento_identidad: string; nombres: string; apellidos: string; razon: string }> }>>([]);
  const [showSyncWarning, setShowSyncWarning] = useState(false);
  /** Cache de alcanzabilidad: evita múltiples HEAD requests en el mismo ciclo */
  const backendReachableRef = useRef<boolean | null>(null);

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

  const syncPendingData = async () => {
    if (syncing) return;

    // Verificar alcanzabilidad real del backend antes de intentar fetch
    const reachable = await isBackendReachable();
    backendReachableRef.current = reachable;

    if (!reachable) {
      // Backend no disponible — modo offline silencioso, sin spam en consola
      return;
    }

    try {
      const pendingSurveys = await dbService.getPendingSurveys();
      
      if (pendingSurveys.length > 0) {
        setSyncing(true);
        console.log(`Sincronizando ${pendingSurveys.length} encuestas con el servidor VPS...`);

        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('auth_user');
        const currentUser = userStr ? JSON.parse(userStr) : null;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${BACKEND_URL}/api/sync`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            encuestas: pendingSurveys,
            usuario: currentUser?.usuario 
          })
        });

        if (res.ok) {
          const data = await res.json();

          // Usar el nuevo campo 'sincronizadas' que incluye localId + documento_identidad
          // para marcar correctamente en SQLite. Compatibilidad hacia atrás con versiones antiguas del backend.
          if (Array.isArray(data.sincronizadas) && data.sincronizadas.length > 0) {
            for (const entry of data.sincronizadas) {
              await dbService.markAsSynchronized(
                entry.localId, 
                entry.documento_identidad,
                {
                  telefono_1: entry.telefono_1,
                  telefono_2: entry.telefono_2,
                  telefono_3: entry.telefono_3,
                }
              );
            }
          } else {
            // Fallback: backend antiguo solo devuelve array plano de IDs locales
            const docMap: Record<number | string, string> = {};
            for (const s of pendingSurveys) {
              if (s.id) docMap[s.id] = s.documento_identidad;
            }
            const idsProcesados = data.sincronizadasLocalIds || pendingSurveys.map((s: any) => s.id).filter(Boolean);
            for (const id of idsProcesados) {
              if (id) {
                await dbService.markAsSynchronized(id, docMap[id]);
              }
            }
          }

          console.log(`Sincronización completada: ${data.procesadas} encuestas. Errores: ${data.errores ?? 0}.`);

          // ── Advertencias de posibles duplicados detectados en el servidor ──────
          // El backend devuelve 'advertencias' cuando una encuesta nueva (recién
          // sincronizada) tiene similitud con un registro ya existente en PostgreSQL.
          // Esto cubre el caso offline: el encuestador no pudo validar contra el
          // servidor cuando registró, pero ahora al sincronizar se detecta el conflicto.
          if (Array.isArray(data.advertencias) && data.advertencias.length > 0) {
            const total = data.advertencias.reduce(
              (acc: number, a: any) => acc + (a.similares?.length || 0), 0
            );
            console.warn(`⚠️ Sincronización: se detectaron ${total} posible(s) duplicado(s).`, data.advertencias);
            setSyncWarnings(data.advertencias);
            setShowSyncWarning(true);
          }

          window.dispatchEvent(new Event('surveys-updated'));

        } else {
          console.warn('El servidor respondió con error al sincronizar:', res.status);
        }

      }
    } catch (error) {
      console.warn('Error durante la sincronización:', error);
    } finally {
      setSyncing(false);
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
          border: '1px solid rgba(251,191,36,0.5)',
          borderRadius: 'var(--radius-lg)',
          padding: '1rem 1.25rem',
          maxWidth: '420px',
          width: 'calc(100% - 2rem)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.3s',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                ⚠ Posibles duplicados detectados al sincronizar
              </p>
              <p style={{ margin: '0.3rem 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {syncWarnings.length} encuesta{syncWarnings.length > 1 ? 's' : ''} sincronizada{syncWarnings.length > 1 ? 's' : ''} podría{syncWarnings.length > 1 ? 'n' : ''} ser duplicada{syncWarnings.length > 1 ? 's' : ''}. Revisa el panel de administración.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '140px', overflowY: 'auto' }}>
                {syncWarnings.map((warn, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>Doc {warn.documento_identidad}</span>
                    {' '}→ similar a:{' '}
                    {warn.similares.map((s, j) => (
                      <span key={j} style={{ color: 'var(--text-main)' }}>
                        {s.nombres} {s.apellidos} ({s.documento_identidad}){j < warn.similares.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowSyncWarning(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-muted)', flexShrink: 0 }}
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
