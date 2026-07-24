import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService } from '../../db';
import type { Survey, User } from '../../db';
import { ArrowLeft, IdCard, MapPin, Calendar, Phone, Wifi, WifiOff } from 'lucide-react';

export default function EncuestadorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [encuestador, setEncuestador] = useState<User | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
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
  }, [id]);

  if (loading) return <div className="container page-view"><p>Cargando datos...</p></div>;
  if (!encuestador) return <div className="container page-view"><p>Encuestador no encontrado.</p></div>;

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={() => navigate('/admin/encuestadores')} className="btn btn-icon btn-outline">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>Encuestas de {encuestador.nombre}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Total recolectadas: {surveys.length}</p>
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
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{survey.nombres} {survey.apellidos}</h3>
                <span className={`badge ${survey.estado_sincronizacion === 'pendiente' ? 'badge-pending' : 'badge-sync'}`}>
                  {survey.estado_sincronizacion === 'pendiente' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><WifiOff size={12} /> Pendiente</span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Wifi size={12} /> Sincronizado</span>
                  )}
                </span>
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
