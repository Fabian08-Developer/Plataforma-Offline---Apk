import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, AlertCircle, Save, Loader2 } from 'lucide-react';
import { BACKEND_URL } from '../../config';

export default function AdminActualizaciones() {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [esObligatorio, setEsObligatorio] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !version) {
      alert('Por favor completa la versión y selecciona un archivo APK.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('apkFile', file);
      formData.append('version', version);
      formData.append('descripcion', descripcion);
      formData.append('esObligatorio', String(esObligatorio));

      console.log('Enviando a:', `${BACKEND_URL}/api/version`);
      console.log('Token:', token ? 'presente' : 'FALTA');
      
      const res = await fetch(`${BACKEND_URL}/api/version`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json().catch(() => null);
      console.log('Respuesta del servidor:', res.status, data);

      if (!res.ok) {
        const serverMsg = data?.error || `Error HTTP ${res.status}`;
        throw new Error(serverMsg);
      }
      
      alert('¡Actualización publicada con éxito!');
      setFile(null);
      setVersion('');
      setDescripcion('');
      setEsObligatorio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (err: any) {
      console.error('Error completo:', err);
      alert(`Error al publicar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <h1 className="app-title" style={{ fontSize: '1.75rem', marginBottom: '2rem' }}>Gestor de Actualizaciones</h1>

      <div className="glass-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Sube el archivo APK más reciente para que los encuestadores puedan descargarlo.
          Si marcas la actualización como obligatoria, no podrán continuar usando la app hasta instalarla.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Número de Versión *</label>
            <input 
              required 
              type="text" 
              value={version} 
              onChange={e => setVersion(e.target.value)} 
              className="form-input" 
              placeholder="Ej. 1.2.0" 
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Archivo APK *</label>
            <div 
              style={{
                border: '2px dashed var(--border)',
                padding: '2rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                background: 'var(--background)',
                cursor: 'pointer'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={32} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
              {file ? (
                <p style={{ color: 'var(--text-main)', margin: 0 }}><strong>{file.name}</strong> ({(file.size / (1024*1024)).toFixed(2)} MB)</p>
              ) : (
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>Haz clic para seleccionar el archivo .apk</p>
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

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descripción de los Cambios</label>
            <textarea 
              value={descripcion} 
              onChange={e => setDescripcion(e.target.value)} 
              className="form-input" 
              rows={4} 
              placeholder="Explica brevemente qué incluye esta actualización..."
              style={{ resize: 'vertical' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', background: 'var(--background)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
            <input 
              type="checkbox" 
              checked={esObligatorio} 
              onChange={(e) => setEsObligatorio(e.target.checked)} 
              style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>Actualización Obligatoria (Forzada)</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Márcalo si hiciste cambios que afectan la base de datos o encuestas.</span>
            </div>
          </label>

          {esObligatorio && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)' }}>
              <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Los encuestadores no podrán usar la app ni enviar datos hasta que instalen esta versión.</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Publicar Actualización
          </button>
        </form>
      </div>
    </div>
  );
}
