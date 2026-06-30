import { useEffect, useState } from 'react';
import { dbService, type Survey } from '../db';
import { Plus, User, Calendar, MapPin, Phone, WifiOff, Wifi, IdCard } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SurveyList() {
  const [surveys, setSurveys] = useState<Survey[]>([]);

  const loadSurveys = async () => {
    try {
      const data = await dbService.getAllSurveys();
      setSurveys(data);
    } catch (error) {
      console.error('Error loading surveys:', error);
    }
  };

  useEffect(() => {
    loadSurveys();
    window.addEventListener('surveys-updated', loadSurveys);
    
    return () => {
      window.removeEventListener('surveys-updated', loadSurveys);
    };
  }, []);

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="app-title" style={{ fontSize: '2rem' }}>Encuestas</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gestiona tus registros offline y online.</p>
        </div>
      </header>

      {surveys.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--background)', borderRadius: '50%', marginBottom: '1rem' }}>
            <User size={48} color="var(--primary)" />
          </div>
          <h3>No hay encuestas registradas</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Presiona el botón flotante para crear la primera encuesta.</p>
        </div>
      ) : (
        <div className="survey-list">
          {surveys.map(survey => (
            <div key={survey.id} className="glass-container survey-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{survey.nombres} {survey.apellidos}</h3>
                <span className={`badge ${survey.estado_sincronizacion === 'pendiente' ? 'badge-pending' : 'badge-sync'}`}>
                  {survey.estado_sincronizacion === 'pendiente' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <WifiOff size={12} /> Pendiente
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Wifi size={12} /> Sincronizado
                    </span>
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

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Link to={`/edit/${survey.id}`} className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  Ver / Editar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/new" className="fab">
        <Plus size={24} />
      </Link>
    </div>
  );
}
