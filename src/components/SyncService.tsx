import { useEffect, useState } from 'react';
import { dbService } from '../db';
import { Wifi } from 'lucide-react';

export default function SyncService() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

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
        console.log(`Sincronizando ${pendingSurveys.length} encuestas usando SQLite...`);

        // Mock backend sync delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        for (const survey of pendingSurveys) {
          if (survey.id) {
            await dbService.markAsSynchronized(survey.id);
          }
        }
        
        console.log('Sincronización completada exitosamente.');
        window.dispatchEvent(new Event('surveys-updated'));
      }
    } catch (error) {
      console.error('Error durante la sincronización:', error);
    } finally {
      setSyncing(false);
    }
  };

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
