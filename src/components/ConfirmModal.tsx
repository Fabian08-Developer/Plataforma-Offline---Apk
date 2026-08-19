import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title = '¿Estás seguro?',
  message,
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  isDanger = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div
        className="glass-container"
        style={{
          maxWidth: '420px',
          width: '100%',
          padding: '2rem',
          textAlign: 'center',
          border: isDanger ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
          boxShadow: isDanger
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 0 25px rgba(239, 68, 68, 0.15)'
            : 'var(--shadow-lg)',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: isDanger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(79, 70, 229, 0.12)',
            color: isDanger ? '#ef4444' : 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
            border: isDanger ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(79, 70, 229, 0.25)',
          }}
        >
          {isDanger ? <Trash2 size={28} /> : <AlertTriangle size={28} />}
        </div>

        {/* Title */}
        <h3
          style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            marginBottom: '0.75rem',
            color: 'var(--text-main)',
          }}
        >
          {title}
        </h3>

        {/* Message */}
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.95rem',
            lineHeight: 1.5,
            marginBottom: '1.75rem',
          }}
        >
          {message}
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="btn btn-outline"
            style={{
              padding: '0.75rem 1rem',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="btn"
            style={{
              padding: '0.75rem 1rem',
              justifyContent: 'center',
              width: '100%',
              background: isDanger ? '#ef4444' : 'var(--primary)',
              color: 'white',
              boxShadow: isDanger ? '0 4px 14px 0 rgba(239, 68, 68, 0.4)' : undefined,
            }}
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
