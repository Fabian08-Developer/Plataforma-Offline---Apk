import { useEffect, useState, useRef } from 'react';
import { dbService } from '../db';
import { Wifi } from 'lucide-react';
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

  if (!isOnline || syncing) {
    return (
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
    );
  }

  return null;
}
