import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextType {
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, title }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg: string, title?: string) => addToast('success', msg, title || '¡Éxito!'),
    error: (msg: string, title?: string) => addToast('error', msg, title || 'Error'),
    warning: (msg: string, title?: string) => addToast('warning', msg, title || 'Atención'),
    info: (msg: string, title?: string) => addToast('info', msg, title || 'Información'),
  };

  const getToastConfig = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle2 size={20} color="#10b981" />,
          borderColor: 'rgba(16, 185, 129, 0.4)',
          bgGlow: 'rgba(16, 185, 129, 0.1)',
        };
      case 'error':
        return {
          icon: <AlertCircle size={20} color="#ef4444" />,
          borderColor: 'rgba(239, 68, 68, 0.4)',
          bgGlow: 'rgba(239, 68, 68, 0.1)',
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={20} color="#f59e0b" />,
          borderColor: 'rgba(245, 158, 11, 0.4)',
          bgGlow: 'rgba(245, 158, 11, 0.1)',
        };
      case 'info':
        return {
          icon: <Info size={20} color="#3b82f6" />,
          borderColor: 'rgba(59, 130, 246, 0.4)',
          bgGlow: 'rgba(59, 130, 246, 0.1)',
        };
    }
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Container */}
      <div
        style={{
          position: 'fixed',
          top: '1.25rem',
          right: '1.25rem',
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          maxWidth: '420px',
          width: 'calc(100% - 2.5rem)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const cfg = getToastConfig(t.type);
          return (
            <div
              key={t.id}
              className="glass-container"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.875rem',
                padding: '1rem 1.25rem',
                border: `1px solid ${cfg.borderColor}`,
                background: 'var(--surface-glass)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                animation: 'slideInTop 0.3s ease-out',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px' }}>{cfg.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {t.title && (
                  <h4
                    style={{
                      margin: '0 0 0.2rem 0',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--text-main)',
                    }}
                  >
                    {t.title}
                  </h4>
                )}
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                  }}
                >
                  {t.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
