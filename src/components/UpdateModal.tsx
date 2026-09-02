import { Download, Sparkles, X, AlertOctagon, ArrowRight } from 'lucide-react';
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
    <>
      <style>{`
        @keyframes um-fade-in {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }
        @keyframes um-pulse-ring {
          0%   { transform: scale(1);   opacity: .6; }
          70%  { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes um-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .um-card {
          animation: um-fade-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .um-icon-ring::before {
          content: '';
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 2px solid currentColor;
          animation: um-pulse-ring 2s ease-out infinite;
        }
        .um-btn-download {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #4f46e5 100%);
          background-size: 200% auto;
          animation: um-shimmer 3s linear infinite;
          transition: box-shadow 0.25s, transform 0.15s;
        }
        .um-btn-download:hover {
          box-shadow: 0 0 24px rgba(124, 58, 237, 0.55);
          transform: translateY(-1px);
        }
        .um-btn-skip {
          transition: background 0.2s, color 0.2s, transform 0.15s;
        }
        .um-btn-skip:hover {
          background: rgba(255,255,255,0.08);
          transform: translateY(-1px);
        }
      `}</style>

      {/* Overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 20, 0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '1.5rem',
      }}>

        {/* Card */}
        <div className="um-card" style={{
          maxWidth: '420px',
          width: '100%',
          borderRadius: '1.5rem',
          overflow: 'hidden',
          background: '#13172b',
          border: esObligatorio
            ? '1px solid rgba(239, 68, 68, 0.35)'
            : '1px solid rgba(99, 102, 241, 0.4)',
          boxShadow: esObligatorio
            ? '0 0 0 1px rgba(239,68,68,0.1), 0 24px 60px rgba(0,0,0,0.6)'
            : '0 0 0 1px rgba(79,70,229,0.15), 0 24px 60px rgba(0,0,0,0.6)',
        }}>

          {/* Header gradient band */}
          <div style={{
            background: esObligatorio
              ? 'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(220,38,38,0.06) 100%)'
              : 'linear-gradient(135deg, rgba(79,70,229,0.22) 0%, rgba(124,58,237,0.08) 100%)',
            padding: '2.5rem 2rem 2rem',
            textAlign: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>

            {/* Animated icon */}
            <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '1.25rem' }}>
              <div
                className="um-icon-ring"
                style={{
                  position: 'relative',
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: esObligatorio
                    ? 'radial-gradient(circle, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.08) 100%)'
                    : 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, rgba(99,102,241,0.08) 100%)',
                  color: esObligatorio ? '#ef4444' : '#818cf8',
                }}
              >
                {esObligatorio
                  ? <AlertOctagon size={34} strokeWidth={1.6} />
                  : <Sparkles size={34} strokeWidth={1.6} />
                }
              </div>
            </div>

            {/* Title */}
            <h2 style={{
              fontSize: '1.45rem',
              fontWeight: 700,
              color: '#f1f5f9',
              marginBottom: '0.6rem',
              letterSpacing: '-0.01em',
            }}>
              {esObligatorio ? 'Actualización Obligatoria' : 'Nueva versión disponible'}
            </h2>

            {/* Version pill */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(148,163,184,0.12)',
                color: '#94a3b8',
                fontSize: '0.78rem',
                padding: '0.25rem 0.75rem',
                borderRadius: '99px',
                border: '1px solid rgba(148,163,184,0.15)',
              }}>
                Actual: v{APP_VERSION}
              </span>
              <ArrowRight size={14} color="#4f46e5" />
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: esObligatorio ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.15)',
                color: esObligatorio ? '#fca5a5' : '#a5b4fc',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '0.25rem 0.75rem',
                borderRadius: '99px',
                border: esObligatorio ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.35)',
              }}>
                Nueva: v{versionMinima}
              </span>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '1.5rem 2rem 2rem' }}>

            {/* Novedades box */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '0.875rem',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
            }}>
              <p style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: esObligatorio ? '#fca5a5' : '#818cf8',
                marginBottom: '0.5rem',
              }}>
                ¿Qué hay de nuevo?
              </p>
              <p style={{
                margin: 0,
                fontSize: '0.88rem',
                color: '#cbd5e1',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {descripcion || 'Mejoras de rendimiento y corrección de errores.'}
              </p>
            </div>

            {/* Obligatorio warning */}
            {esObligatorio && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '0.75rem',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
              }}>
                <AlertOctagon size={15} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#f87171', lineHeight: 1.5 }}>
                  Esta actualización incluye cambios críticos. <strong>Debes instalarla</strong> para continuar usando la app.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <a
                href={urlDescarga}
                download
                onClick={() => { if (!esObligatorio && onSkip) onSkip(); }}
                className="um-btn-download"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.625rem',
                  padding: '0.95rem 1.5rem',
                  borderRadius: '0.875rem',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  textDecoration: 'none',
                  letterSpacing: '0.01em',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Download size={20} />
                Descargar v{versionMinima}
              </a>

              {!esObligatorio && onSkip && (
                <button
                  onClick={onSkip}
                  className="um-btn-skip"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.85rem 1.5rem',
                    borderRadius: '0.875rem',
                    color: '#64748b',
                    fontWeight: 500,
                    fontSize: '0.88rem',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                  Omitir por ahora
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
