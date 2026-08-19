import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../../db';
import type { Survey, User } from '../../db';
import { useAuth } from '../../context/AuthContext';
import { BACKEND_URL } from '../../config';
import { ArrowLeft, IdCard, MapPin, Calendar, Phone, Wifi, WifiOff, Edit } from 'lucide-react';

export default function EncuestadorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const [encuestador, setEncuestador] = useState<User | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      setLoading(true);

      try {
        // 1. Intentar cargar desde el backend centralizado (VPS)
        const authToken = token || localStorage.getItem('auth_token');
        if (navigator.onLine || authToken) {
          const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores/${id}`, {
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
          });

          if (res.ok) {
            const data = await res.json();
            if (data.encuestador) {
              setEncuestador(data.encuestador);
              setSurveys((data.encuestas || []).map((s: any) => ({
                id: s.id,
                encuestador_id: s.encuestador_id,
                tipo_documento: s.tipo_documento,
                documento_identidad: s.documento_identidad,
                nombres: s.nombres,
                apellidos: s.apellidos,
                telefono_1: s.telefono_1,
                telefono_2: s.telefono_2,
                telefono_3: s.telefono_3,
                direccion: s.direccion,
                fecha_registro: s.fecha_registro,
                profesion: s.profesion,
                estado_sincronizacion: s.estado_sincronizacion || 'sincronizado'
              })));
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Fallback a encuestas locales de SQLite:', err);
      }

      // 2. Fallback local a SQLite
      const allEncuestadores = await dbService.getAllEncuestadores();
      const found = allEncuestadores.find(e => e.id === Number(id));
      
      if (found) {
        setEncuestador(found);
        const data = await dbService.getSurveysByEncuestador(Number(id));
        setSurveys(data);
      }
      setLoading(false);
    }
    loadData();
  }, [id, token]);

  if (loading) return <div className="container page-view"><p>Cargando datos...</p></div>;
  if (!encuestador) return <div className="container page-view"><p>Encuestador no encontrado.</p></div>;

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header className="page-header">
        <div className="page-header-info">
          <button onClick={() => navigate('/admin/encuestadores')} className="btn btn-icon btn-outline" title="Volver a encuestadores">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>Encuestas de {encuestador.nombre}</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Total recolectadas: <strong>{surveys.length}</strong></p>
          </div>
        </div>
      </header>

      {surveys.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h3>Sin actividad</h3>
          <p style={{ color: 'var(--text-muted)' }}>Este encuestador aún no ha registrado encuestas en el sistema.</p>
        </div>
      ) : (
        <div className="survey-list">
          {surveys.map(survey => (
            <div key={survey.id} className="glass-container survey-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{survey.nombres} {survey.apellidos}</h3>
                  <span className={`badge ${survey.estado_sincronizacion === 'pendiente' ? 'badge-pending' : 'badge-sync'}`} style={{ width: 'fit-content' }}>
                    {survey.estado_sincronizacion === 'pendiente' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><WifiOff size={12} /> Pendiente</span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Wifi size={12} /> Sincronizado</span>
                    )}
                  </span>
                </div>
                <button 
                  onClick={() => navigate(`/admin/edit/${survey.id}`)}
                  className="btn btn-icon btn-outline" 
                  title="Editar Encuesta"
                  style={{ padding: '0.5rem' }}
                >
                  <Edit size={16} />
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IdCard size={16} /> <span>{survey.tipo_documento}: {survey.documento_identidad}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone size={16} /> <span>{survey.telefono_1}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={16} /> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{survey.direccion}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} /> <span>{survey.fecha_registro}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
