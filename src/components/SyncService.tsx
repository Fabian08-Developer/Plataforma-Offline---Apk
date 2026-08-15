import { useEffect, useState } from 'react';
import { dbService } from '../db';
import { Wifi } from 'lucide-react';
import UpdateModal from './UpdateModal';
import { APP_VERSION, BACKEND_URL } from '../config';

export default function SyncService() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [updateData, setUpdateData] = useState<{ versionMinima: string, urlDescarga: string, descripcion: string, esObligatorio: boolean } | null>(null);

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
    setTimeout(() => {
      if (navigator.onLine) {
        syncPendingData();
      }
    }, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('trigger-sync', syncPendingData);
    };
  }, []);

  const syncPendingData = async () => {
    if (syncing) return;
    setSyncing(true);

    try {
      const pendingSurveys = await dbService.getPendingSurveys();
      
      if (pendingSurveys.length > 0) {
        console.log(`Sincronizando ${pendingSurveys.length} encuestas con el servidor VPS...`);

        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${BACKEND_URL}/api/sync`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ encuestas: pendingSurveys })
        });

        if (res.ok) {
          const data = await res.json();
          const idsProcesados = data.sincronizadasLocalIds || pendingSurveys.map(s => s.id).filter(Boolean);

          for (const id of idsProcesados) {
            if (id) {
              await dbService.markAsSynchronized(id);
            }
          }
          
          console.log('Sincronización real completada exitosamente.');
          window.dispatchEvent(new Event('surveys-updated'));
        } else {
          console.warn('El servidor respondió con error al sincronizar:', res.status);
        }
      }

      // --- Revisar actualizaciones de versión después de sincronizar ---
      try {
        const response = await fetch(`${BACKEND_URL}/api/version`);
        if (response.ok) {
          const data = await response.json();
          // Comparación semántica simple
          if (data.version_minima.localeCompare(APP_VERSION, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
            
            // Revisar si ya fue omitida
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
      } catch (err) {
        console.log('No se pudo verificar la versión', err);
      }
      
    } catch (error) {
      console.error('Error durante la sincronización:', error);
    } finally {
      setSyncing(false);
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
