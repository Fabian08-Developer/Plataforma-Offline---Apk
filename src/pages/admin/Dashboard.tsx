import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dbService } from '../../db';
import type { Survey, User } from '../../db';
import { BACKEND_URL } from '../../config';
import { Users, FileText, Wifi, WifiOff, LogOut, DownloadCloud, ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [encuestadores, setEncuestadores] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Intentar obtener datos globales centralizados del servidor backend
        if (token) {
          const res = await fetch(`${BACKEND_URL}/api/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (res.ok) {
            const data = await res.json();
            if (data.encuestas) {
              setSurveys(data.encuestas.map((e: any) => ({
                id: e.id,
                tipo_documento: e.tipo_documento,
                documento_identidad: e.documento_identidad,
                nombres: e.nombres,
                apellidos: e.apellidos,
                telefono_1: e.telefono_1,
                telefono_2: e.telefono_2,
                telefono_3: e.telefono_3,
                direccion: e.direccion,
                fecha_registro: e.fecha_registro,
                profesion: e.profesion,
                estado_sincronizacion: 'sincronizado'
              })));
            }

            // Cargar lista de encuestadores directamente desde la API central
            const encRes = await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (encRes.ok) {
              const remoteEnc: User[] = await encRes.json();
              setEncuestadores(remoteEnc);
            } else {
              const allEncuestadores = await dbService.getAllEncuestadores();
              setEncuestadores(allEncuestadores);
            }

            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Backend indisponible para métricas globales, fallback a SQLite local:', err);
      }

      // Fallback a la base de datos local SQLite si el backend no responde
      const allSurveys = await dbService.getAllSurveys();
      const allEncuestadores = await dbService.getAllEncuestadores();
      setSurveys(allSurveys);
      setEncuestadores(allEncuestadores);
      setLoading(false);
    }
    loadData();
  }, [token]);

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
        <Link to="/admin/encuestas" style={{ textDecoration: 'none' }}>
          <div className="glass-container" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid var(--primary)' }}>
            <div style={{ padding: '1rem', background: 'rgba(79, 70, 229, 0.12)', color: 'var(--primary)', borderRadius: '1rem' }}>
              <FileText size={28} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Gestor Encuestas</p>
              <h2 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-main)' }}>{surveys.length}</h2>
            </div>
          </div>
        </Link>

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

        <Link to="/admin/actualizaciones" style={{ textDecoration: 'none' }}>
          <div className="glass-container" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid #3b82f6' }}>
            <div style={{ padding: '1rem', background: '#3b82f6', color: 'white', borderRadius: '1rem' }}>
              <DownloadCloud size={28} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Actualizaciones</p>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', marginTop: '0.5rem' }}>Subir APK</h2>
            </div>
          </div>
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Últimas Encuestas Globales</h2>
        <Link to="/admin/encuestas" className="btn btn-outline" style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
          Ver Todas / Gestionar <ChevronRight size={16} />
        </Link>
      </div>
      {loading ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando encuestas centralizadas...</p>
        </div>
      ) : surveys.length === 0 ? (
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
