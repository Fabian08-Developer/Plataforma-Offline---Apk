import { useEffect, useState } from 'react';
import { dbService, type Survey } from '../db';
import { Plus, User, Calendar, MapPin, Phone, WifiOff, Wifi, IdCard, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BACKEND_URL } from '../config';

export default function SurveyList() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const loadSurveys = async () => {
    try {
      // 1. Cargar inmediatamente desde SQLite local (Offline-first)
      if (user) {
        const localData = await dbService.getSurveysByEncuestador(user.id, user.usuario);
        setSurveys(localData);
      }

      // 2. Si estamos online, descargar las encuestas del servidor VPS (Sincronización multidispositivo)
      const authToken = token || localStorage.getItem('auth_token');
      if (navigator.onLine && authToken) {
        const res = await fetch(`${BACKEND_URL}/api/encuestas/mis-encuestas`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (res.ok) {
          const remoteSurveys: any[] = await res.json();
          let hasNewData = false;

          for (const s of remoteSurveys) {
            const existing = await dbService.getSurveyByDocumento(s.documento_identidad);
            if (!existing) {
              await dbService.addSurvey({
                encuestador_id: user?.id,
                encuestador_usuario: user?.usuario,
                tipo_documento: s.tipo_documento,
                documento_identidad: s.documento_identidad,
                nombres: s.nombres,
                apellidos: s.apellidos,
                telefono_1: s.telefono_1,
                telefono_2: s.telefono_2 || '',
                telefono_3: s.telefono_3 || '',
                direccion: s.direccion,
                fecha_registro: s.fecha_registro,
                profesion: s.profesion || '',
                estado_sincronizacion: 'sincronizado'
              });
              hasNewData = true;
            }
          }

          // Si se descargaron encuestas nuevas de la nube, refrescar la lista local
          if (hasNewData && user) {
            const updated = await dbService.getSurveysByEncuestador(user.id, user.usuario);
            setSurveys(updated);
          }
        }
      }
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
  }, [user, token]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header className="app-header" style={{ marginBottom: '2rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="app-title truncate-text" style={{ fontSize: '1.75rem', margin: 0 }}>Mis Encuestas</h1>
          <p className="truncate-text" style={{ color: 'var(--text-muted)', margin: 0 }}>Bienvenido, {user?.nombre}</p>
        </div>
        <button onClick={handleLogout} className="btn btn-icon btn-outline" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} title="Cerrar sesión">
          <LogOut size={20} />
        </button>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.5rem' }}>
                <h3 className="truncate-text" style={{ margin: 0, fontSize: '1.1rem', flex: 1, minWidth: '150px' }}>{survey.nombres} {survey.apellidos}</h3>
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
                  <MapPin size={16} style={{ flexShrink: 0 }} /> <span className="truncate-text">{survey.direccion}</span>
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
