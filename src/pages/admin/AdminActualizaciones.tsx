import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  UploadCloud,
  AlertCircle,
  Save,
  Loader2,
  ArrowLeft,
  Download,
  Calendar,
  Smartphone,
  Copy,
  RefreshCw,
  FileCheck,
  X,
  Sparkles,
} from 'lucide-react';
import { BACKEND_URL } from '../../config';

interface AppVersionItem {
  id: number;
  version: string;
  descripcion: string;
  esObligatorio: boolean;
  urlApk: string;
  creado_en?: string;
}

export default function AdminActualizaciones() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [version, setVersion] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [esObligatorio, setEsObligatorio] = useState(false);

  // Historial de versiones y versión activa
  const [history, setHistory] = useState<AppVersionItem[]>([]);
  const [activeVersion, setActiveVersion] = useState<AppVersionItem | null>(null);

  // Cargar historial de versiones publicadas
  const loadVersionHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/version/list`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setHistory(data);
          if (data.length > 0) {
            setActiveVersion(data[0]);
            // Sugerir la siguiente versión si el input está vacío
            if (!version && data[0].version) {
              const parts = data[0].version.split('.').map(Number);
              if (parts.length === 3 && !isNaN(parts[2])) {
                setVersion(`${parts[0]}.${parts[1]}.${parts[2] + 1}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('No se pudo cargar el historial de versiones:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadVersionHistory();
  }, []);

  // Manejo de drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.toLowerCase().endsWith('.apk')) {
        setFile(droppedFile);
      } else {
        toast.warning('El archivo seleccionado debe tener extensión .apk');
      }
    }
  };

  const handleCopyDownloadUrl = () => {
    const downloadUrl = `${BACKEND_URL}/api/version/download`;
    navigator.clipboard.writeText(downloadUrl);
    toast.success('Enlace de descarga copiado al portapapeles');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !version.trim()) {
      toast.warning('Por favor completa el número de versión y selecciona el archivo .apk');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('apkFile', file);
      formData.append('version', version.trim());
      formData.append('descripcion', descripcion.trim());
      formData.append('esObligatorio', String(esObligatorio));

      const res = await fetch(`${BACKEND_URL}/api/version`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const serverMsg = data?.error || `Error HTTP ${res.status}`;
        throw new Error(serverMsg);
      }

      toast.success(`Versión v${version} publicada correctamente.`);
      setFile(null);
      setDescripcion('');
      setEsObligatorio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Recargar historial
      loadVersionHistory();
    } catch (err: any) {
      console.error('Error publicando versión:', err);
      toast.error(`Error al publicar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      {/* ── Header Principal ── */}
      <header className="page-header" style={{ marginBottom: '1.75rem' }}>
        <div className="page-header-info">
          <button
            onClick={() => navigate('/admin')}
            className="btn btn-icon btn-outline"
            title="Volver al panel principal"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>
              Gestor de Actualizaciones
            </h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
              Publicación y distribución de paquetes APK para dispositivos móviles
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={loadVersionHistory}
            className="btn btn-sm btn-outline"
            title="Recargar historial"
            style={{ borderRadius: '20px', padding: '0.4rem 0.8rem' }}
          >
            <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </header>

      {/* ── Layout Adaptativo en 2 Columnas (Desktop / Laptop) o 1 Columna (Móvil / Tablet) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* ── COLUMNA 1: Formulario de Publicación ── */}
        <div className="glass-container" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(79, 70, 229, 0.12)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Publicar Nueva Versión</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Sube el paquete .apk compilado desde Android Studio
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Input Número de Versión */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Número de Versión *</span>
                {activeVersion && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 500 }}>
                    Versión actual: v{activeVersion.version}
                  </span>
                )}
              </label>
              <input
                required
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="form-input"
                placeholder="Ej. 1.0.2"
                style={{ fontSize: '1rem', fontWeight: 600 }}
              />
            </div>

            {/* Dropzone para seleccionar archivo APK */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Archivo APK Instalable *</label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging
                    ? '2px dashed var(--primary)'
                    : file
                    ? '2px solid rgba(16, 185, 129, 0.5)'
                    : '2px dashed var(--border)',
                  padding: file ? '1.25rem' : '1.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  background: isDragging
                    ? 'rgba(79, 70, 229, 0.05)'
                    : file
                    ? 'rgba(16, 185, 129, 0.04)'
                    : 'var(--background)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {file ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <FileCheck size={24} />
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.name}
                        </p>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {(file.size / (1024 * 1024)).toFixed(2)} MB • Listo para subir
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="btn btn-icon btn-outline"
                      title="Cambiar archivo"
                      style={{ padding: '0.4rem', color: 'var(--text-muted)' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <UploadCloud size={36} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
                    <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, fontSize: '0.95rem' }}>
                      Haz clic para seleccionar o arrastra el archivo .apk
                    </p>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Soporta paquetes compilados de hasta 100 MB
                    </span>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apk"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setFile(e.target.files[0]);
                    }
                  }}
                />
              </div>
            </div>

            {/* Descripción de los cambios */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Notas de la Versión (Changelog)</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="form-input"
                rows={3}
                placeholder="Explica brevemente qué novedades, correcciones o mejoras incluye..."
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Checkbox de Actualización Obligatoria */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                cursor: 'pointer',
                background: esObligatorio ? 'rgba(239, 68, 68, 0.06)' : 'var(--background)',
                border: esObligatorio ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.2s',
              }}
            >
              <input
                type="checkbox"
                checked={esObligatorio}
                onChange={(e) => setEsObligatorio(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#ef4444', marginTop: '2px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: esObligatorio ? '#ef4444' : 'var(--text-main)' }}>
                  Actualización Obligatoria (Forzada)
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Si se activa, los encuestadores no podrán continuar registrando ni sincronizando encuestas hasta instalar esta versión.
                </span>
              </div>
            </label>

            {esObligatorio && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>Esta versión bloqueará versiones anteriores de la app móvil.</span>
              </div>
            )}

            {/* Botón de envío */}
            <button
              type="submit"
              disabled={loading || !file}
              className="btn btn-primary"
              style={{
                padding: '0.85rem',
                display: 'flex',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                opacity: loading || !file ? 0.7 : 1,
              }}
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              <span>{loading ? 'Subiendo archivo APK...' : 'Publicar y Distribuir Versión'}</span>
            </button>
          </form>
        </div>

        {/* ── COLUMNA 2: Versión Activa, Descarga e Historial ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Tarjeta de Versión Activa */}
          <div
            className="glass-container"
            style={{
              padding: '1.75rem',
              border: '1px solid rgba(79, 70, 229, 0.35)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                width: '80px',
                height: '80px',
                background: 'rgba(79, 70, 229, 0.08)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)', fontWeight: 700 }}>
                  Versión Activa en Servidor
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    v{activeVersion ? activeVersion.version : '1.0.0'}
                  </h3>
                  {activeVersion?.esObligatorio ? (
                    <span
                      style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#ef4444',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '12px',
                      }}
                    >
                      Obligatoria
                    </span>
                  ) : (
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '12px',
                      }}
                    >
                      Recomendada
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: 'rgba(79, 70, 229, 0.12)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Smartphone size={24} />
              </div>
            </div>

            {activeVersion?.descripcion && (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: '0 0 1.25rem 0' }}>
                "{activeVersion.descripcion}"
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <a
                href={`${BACKEND_URL}/api/version/download`}
                download
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '0.65rem 1rem',
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
              >
                <Download size={16} /> Descargar APK Oficial
              </a>

              <button
                type="button"
                onClick={handleCopyDownloadUrl}
                className="btn btn-outline"
                title="Copiar URL directa de descarga"
                style={{ padding: '0.65rem' }}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          {/* Historial de Versiones Anteriores */}
          <div className="glass-container" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Historial de Versiones</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {history.length} registrada{history.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loadingHistory ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>
                Cargando historial...
              </p>
            ) : history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)' }}>
                <Smartphone size={32} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No hay versiones registradas aún.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '360px', overflowY: 'auto' }}>
                {history.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      background: idx === 0 ? 'rgba(79, 70, 229, 0.06)' : 'var(--background)',
                      border: idx === 0 ? '1px solid rgba(79, 70, 229, 0.25)' : '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.95rem' }}>v{item.version}</strong>
                        {idx === 0 && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: 'var(--primary)',
                              color: 'white',
                              padding: '1px 6px',
                              borderRadius: '8px',
                            }}
                          >
                            ACTUAL
                          </span>
                        )}
                        {item.esObligatorio && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              padding: '1px 6px',
                              borderRadius: '8px',
                            }}
                          >
                            Obligatoria
                          </span>
                        )}
                      </div>

                      {item.creado_en && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} /> {new Date(item.creado_en).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {item.descripcion && (
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                        {item.descripcion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guía Rápida para Compilar en Android Studio */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.9rem' }}>
              <Sparkles size={16} color="var(--primary)" />
              <span>¿Cómo generar un nuevo APK?</span>
            </div>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <li>Ejecuta <code>npm run build</code> en la terminal.</li>
              <li>Ejecuta <code>npx cap sync android</code> para sincronizar.</li>
              <li>En Android Studio: <strong>Build &gt; Build Bundle(s) / APK(s) &gt; Build APK(s)</strong>.</li>
              <li>Sube el archivo <code>app-debug.apk</code> resultante aquí.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
