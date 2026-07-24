import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dbService } from '../../db';
import type { Survey, User } from '../../db';
import { Users, FileText, Wifi, WifiOff, LogOut } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [encuestadores, setEncuestadores] = useState<User[]>([]);

  useEffect(() => {
    async function loadData() {
      const allSurveys = await dbService.getAllSurveys();
      const allEncuestadores = await dbService.getAllEncuestadores();
      setSurveys(allSurveys);
      setEncuestadores(allEncuestadores);
    }
    loadData();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pendingCount = surveys.filter(s => s.estado_sincronizacion === 'pendiente').length;
  const syncedCount = surveys.filter(s => s.estado_sincronizacion === 'sincronizado').length;

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 className="app-title" style={{ fontSize: '2rem' }}>Panel de Control</h1>
          <p style={{ color: 'var(--text-muted)' }}>Bienvenido, {user?.nombre} (Administrador)</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: 'rgba(239, 68, 68, 0.5)', color: '#ef4444' }}>
          <LogOut size={16} /> Salir
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="glass-container" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', borderRadius: '1rem' }}>
            <FileText size={28} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Total Encuestas</p>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>{surveys.length}</h2>
          </div>
        </div>

        <div className="glass-container" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '1rem' }}>
            <Wifi size={28} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sincronizadas</p>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>{syncedCount}</h2>
          </div>
        </div>

        <div className="glass-container" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderRadius: '1rem' }}>
            <WifiOff size={28} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Pendientes</p>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>{pendingCount}</h2>
          </div>
        </div>

        <Link to="/admin/encuestadores" style={{ textDecoration: 'none' }}>
          <div className="glass-container" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--primary)' }}>
            <div style={{ padding: '1rem', background: 'var(--primary)', color: 'white', borderRadius: '1rem' }}>
              <Users size={28} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Encuestadores</p>
              <h2 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-main)' }}>{encuestadores.length}</h2>
            </div>
          </div>
        </Link>
      </div>

      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Últimas Encuestas Globales</h2>
      {surveys.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No hay encuestas registradas en la base de datos.</p>
        </div>
      ) : (
        <div className="glass-container" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Documento</th>
                <th style={{ padding: '1rem' }}>Nombre</th>
                <th style={{ padding: '1rem' }}>Fecha</th>
                <th style={{ padding: '1rem' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {surveys.slice(0, 5).map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem' }}>{s.tipo_documento} {s.documento_identidad}</td>
                  <td style={{ padding: '1rem' }}>{s.nombres} {s.apellidos}</td>
                  <td style={{ padding: '1rem' }}>{s.fecha_registro}</td>
                  <td style={{ padding: '1rem' }}>
                    <span className={`badge ${s.estado_sincronizacion === 'pendiente' ? 'badge-pending' : 'badge-sync'}`} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                      {s.estado_sincronizacion}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
