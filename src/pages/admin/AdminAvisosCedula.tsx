import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { BACKEND_URL } from '../../config';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Version {
  encuestador?: { id: number; nombre: string; usuario: string } | null;
  nombres?: string;
  apellidos?: string;
  tipo_documento?: string;
  telefono_1?: string;
  telefono_2?: string;
  telefono_3?: string;
  direccion?: string;
  profesion?: string;
  fecha_registro?: string;
  actualizado_en?: string | null;
  autor?: { nombre: string; usuario: string };
}

interface Aviso {
  id: number;
  documento_identidad: string;
  creado_en: string;
  resuelto: boolean;
  previo: Version;
  recibido: Version;
  encuesta_actual: { id: number; nombres: string; apellidos: string } | null;
}

const telefonos = (v: Version) => [v.telefono_1, v.telefono_2, v.telefono_3].filter(Boolean).join(' · ') || '—';

function Bloque({ titulo, version, encabezado }: { titulo: string; version: Version; encabezado: string }) {
  return (
    <div style={{ flex: 1, minWidth: 220, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.85rem 1rem' }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{titulo}</p>
      <p style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{encabezado}</p>
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-main)' }}>{version.nombres} {version.apellidos}</p>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-main)' }}>Tel: {telefonos(version)}</p>
      <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-main)' }}>Dirección: {version.direccion || '—'}</p>
      <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-main)' }}>Profesión: {version.profesion || '—'}</p>
    </div>
  );
}

export default function AdminAvisosCedula() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarRevisados, setMostrarRevisados] = useState(false);
  const [resolviendo, setResolviendo] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/avisos-cedula${mostrarRevisados ? '?resuelto=true' : ''}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) throw new Error('No se pudieron cargar los avisos');
      setAvisos(await res.json());
    } catch {
      toast.error('No se pudieron cargar los avisos. Verifique la conexión.');
    } finally {
      setLoading(false);
    }
  }, [token, mostrarRevisados, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcarRevisado = async (id: number) => {
    setResolviendo(id);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/avisos-cedula/${id}/resolver`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) throw new Error();
      setAvisos((prev) => prev.filter((a) => a.id !== id));
      toast.success('Aviso marcado como revisado.');
    } catch {
      toast.error('No se pudo marcar el aviso. Intente de nuevo.');
    } finally {
      setResolviendo(null);
    }
  };

  /** Reemplaza los datos del dueño con la captura recibida. Requiere confirmación: es un cambio de datos. */
  const usarCaptura = async (id: number) => {
    if (!window.confirm('Esto reemplaza los datos de la encuesta original con la captura recibida. El encuestador dueño no cambia. ¿Continuar?')) return;
    setResolviendo(id);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/avisos-cedula/${id}/usar-captura`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo aplicar la captura');
      setAvisos((prev) => prev.filter((a) => a.id !== id));
      toast.success('Captura aplicada a la encuesta original.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aplicar la captura.');
    } finally {
      setResolviendo(null);
    }
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin')} style={{ padding: '0.45rem 0.8rem' }}>
          <ArrowLeft size={16} /> Volver
        </button>
        <h2 style={{ margin: 0, fontSize: '1.25rem', flex: 1 }}>Avisos de cédula repetida</h2>
        <button type="button" className="btn btn-secondary" onClick={cargar} style={{ padding: '0.45rem 0.8rem' }}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        Un encuestador sincronizó una cédula que ya pertenece a otro encuestador. La encuesta original NO se modificó. Revise ambas
        versiones y decida: mantener el registro actual, o usar la captura recibida.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => setMostrarRevisados(false)} className={!mostrarRevisados ? 'btn btn-primary' : 'btn btn-secondary'} style={{ padding: '0.4rem 0.8rem' }}>
          Pendientes
        </button>
        <button type="button" onClick={() => setMostrarRevisados(true)} className={mostrarRevisados ? 'btn btn-primary' : 'btn btn-secondary'} style={{ padding: '0.4rem 0.8rem' }}>
          Revisados
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando avisos...</p>
      ) : avisos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay avisos {mostrarRevisados ? 'revisados' : 'pendientes'}.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {avisos.map((a) => (
            <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <AlertTriangle size={18} color="#f59e0b" />
                <strong style={{ fontFamily: 'monospace' }}>Cédula {a.documento_identidad}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(a.creado_en).toLocaleString()}</span>
                {!a.encuesta_actual && <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>· La encuesta original ya fue eliminada</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Bloque
                  titulo="Registro existente"
                  encabezado={`Capturado por: ${a.previo.encuestador?.nombre ?? 'desconocido'} (${a.previo.encuestador?.usuario ?? '—'})`}
                  version={a.previo}
                />
                <Bloque
                  titulo="Captura recibida"
                  encabezado={`Enviada por: ${a.recibido.autor?.nombre ?? 'desconocido'} (${a.recibido.autor?.usuario ?? '—'})`}
                  version={a.recibido}
                />
              </div>
              {!a.resuelto && (
                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" disabled={resolviendo === a.id} onClick={() => marcarRevisado(a.id)} style={{ padding: '0.45rem 0.9rem' }}>
                    <CheckCircle2 size={16} /> {resolviendo === a.id ? 'Guardando...' : 'Mantener registro actual'}
                  </button>
                  <button type="button" className="btn btn-primary" disabled={resolviendo === a.id} onClick={() => usarCaptura(a.id)} style={{ padding: '0.45rem 0.9rem' }}>
                    Usar captura recibida
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
