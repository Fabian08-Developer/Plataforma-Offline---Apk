import { Download, AlertTriangle, X } from 'lucide-react';
import { APP_VERSION } from '../config';

interface UpdateModalProps {
  versionMinima: string;
  urlDescarga: string;
  descripcion: string;
  esObligatorio: boolean;
  onSkip?: () => void;
}

export default function UpdateModal({ versionMinima, urlDescarga, descripcion, esObligatorio, onSkip }: UpdateModalProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '2rem'
    }}>
      <div className="glass-container" style={{
        maxWidth: '450px',
        width: '100%',
        padding: '3rem 2rem',
        textAlign: 'center',
        background: 'var(--card-bg)',
        border: '1px solid var(--primary)'
      }}>
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.15)', 
          color: '#ef4444', 
          width: '80px', 
          height: '80px', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto'
        }}>
          <AlertTriangle size={40} />
        </div>
        
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: 'white' }}>
          {esObligatorio ? 'Actualización Obligatoria' : 'Nueva Versión Disponible'}
        </h2>
        
        <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          Tu versión actual es: <strong>v{APP_VERSION}</strong>
        </p>
        
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', textAlign: 'left' }}>
          <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary)' }}>Novedades (v{versionMinima}):</strong>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
            {descripcion || 'Mejoras de rendimiento y corrección de errores.'}
          </p>
        </div>

        {esObligatorio && (
          <p style={{ color: '#ef4444', marginBottom: '2rem', fontSize: '0.9rem' }}>
            * Esta actualización incluye cambios críticos. Debes instalarla para poder continuar.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <a 
            href={urlDescarga} 
            download
            onClick={() => {
              if (!esObligatorio && onSkip) onSkip(); // Si la descargó, igual la puede saltar visualmente
            }}
            className="btn btn-primary"
            style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'center', gap: '0.75rem', fontSize: '1.1rem' }}
          >
            <Download size={24} />
            Descargar Nueva Versión
          </a>

          {!esObligatorio && onSkip && (
            <button 
              onClick={onSkip}
              className="btn btn-outline"
              style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'center', gap: '0.75rem', fontSize: '1rem' }}
            >
              <X size={20} />
              Omitir por ahora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
