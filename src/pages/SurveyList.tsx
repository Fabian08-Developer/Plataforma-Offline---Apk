import { useEffect, useState, useMemo } from 'react';
import { dbService, type Survey } from '../db';
import {
  Plus,
  User,
  Calendar,
  MapPin,
  Phone,
  WifiOff,
  Wifi,
  IdCard,
  LogOut,
  RefreshCw,
  Search,
  X,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BACKEND_URL } from '../config';
import { getSurveyTime, getTodayRange, getThisWeekRange } from '../services/filterUtils';

export default function SurveyList() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [reloading, setReloading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPreset, setFilterPreset] = useState<'all' | 'today' | 'this_week' | 'pending' | 'synced'>('all');

  const { user, token, logout } = useAuth();
  const { toast } = useToast();
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
          let hasChanges = false;
          const remoteDocSet = new Set(remoteSurveys.map((s: any) => String(s.documento_identidad).trim()));

          // A. Insertar encuestas que estén en la nube pero no en el SQLite local
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
              hasChanges = true;
            }
          }

          // B. SINCRONIZACIÓN DE ELIMINACIONES (Bidireccional):
          // Si una encuesta local ya estaba 'sincronizado' (subida previamente al servidor),
          // pero el servidor ya NO la devuelve en remoteSurveys, significa que un Administrador
          // la eliminó en el Panel Web. Se elimina inmediatamente del SQLite local del encuestador.
          if (user) {
            const currentLocal = await dbService.getSurveysByEncuestador(user.id, user.usuario);
            for (const loc of currentLocal) {
              if (loc.estado_sincronizacion === 'sincronizado' && !remoteDocSet.has(String(loc.documento_identidad).trim())) {
                console.log(`[Sync] Eliminando localmente encuesta borrada por el admin: ${loc.documento_identidad}`);
                if (loc.documento_identidad) {
                  await dbService.deleteSurveyByDocumento(loc.documento_identidad);
                }
                if (loc.id) {
                  await dbService.deleteSurvey(loc.id);
                }
                hasChanges = true;
              }
            }
          }

          // Si hubo cambios (altas o bajas), refrescar la lista local
          if (hasChanges && user) {
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

  const handleReload = async () => {
    setReloading(true);
    try {
      window.dispatchEvent(new Event('trigger-sync'));

      const startTime = Date.now();
      await loadSurveys();
      const elapsed = Date.now() - startTime;
      if (elapsed < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
      }

      if (navigator.onLine) {
        toast.success('Lista actualizada y sincronizada con el servidor');
      } else {
        toast.info('Lista de encuestas recargada (Modo offline)');
      }
    } catch (err) {
      console.error('Error al recargar:', err);
      toast.error('Ocurrió un error al recargar las encuestas');
    } finally {
      setReloading(false);
    }
  };

  // Filtrado de encuestas
  const filteredSurveys = useMemo(() => {
    return surveys.filter((s) => {
      // 1. Preset de tiempo y estado
      if (filterPreset === 'today') {
        const today = getTodayRange().desde;
        if (s.fecha_registro !== today) return false;
      } else if (filterPreset === 'this_week') {
        const { desde, hasta } = getThisWeekRange();
        const date = (s.fecha_registro || '').substring(0, 10);
        if (date < desde || date > hasta) return false;
      } else if (filterPreset === 'pending') {
        if (s.estado_sincronizacion !== 'pendiente') return false;
      } else if (filterPreset === 'synced') {
        if (s.estado_sincronizacion !== 'sincronizado') return false;
      }

      // 2. Búsqueda por texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const doc = (s.documento_identidad || '').toLowerCase();
        const nombres = (s.nombres || '').toLowerCase();
        const apellidos = (s.apellidos || '').toLowerCase();
        const full = `${nombres} ${apellidos}`;
        const tel = (s.telefono_1 || '').toLowerCase();
        const dir = (s.direccion || '').toLowerCase();
        if (!doc.includes(term) && !full.includes(term) && !tel.includes(term) && !dir.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [surveys, filterPreset, searchTerm]);

  // Conteos
  const pendingCount = useMemo(() => surveys.filter((s) => s.estado_sincronizacion === 'pendiente').length, [surveys]);
  const syncedCount = useMemo(() => surveys.filter((s) => s.estado_sincronizacion === 'sincronizado').length, [surveys]);

  const hasActiveFilters = filterPreset !== 'all' || searchTerm.trim() !== '';

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header className="app-header" style={{ marginBottom: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="app-title truncate-text" style={{ fontSize: '1.75rem', margin: 0 }}>Mis Encuestas</h1>
          <p className="truncate-text" style={{ color: 'var(--text-muted)', margin: 0 }}>Bienvenido, {user?.nombre}</p>
        </div>
        <button
          onClick={handleReload}
          disabled={reloading}
          className="btn btn-icon btn-outline"
          title="Recargar encuestas"
          style={{ color: 'var(--primary)', borderColor: 'rgba(var(--primary-rgb, 99,102,241),0.3)' }}
        >
          <RefreshCw size={20} className={reloading ? 'animate-spin' : ''} />
        </button>
        <button onClick={handleLogout} className="btn btn-icon btn-outline" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </header>

      {/* Barra de Búsqueda y Filtros Rápidos */}
      {surveys.length > 0 && (
        <div
          className="glass-container"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {/* Buscador */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cédula, nombre, teléfono..."
              className="form-input"
              style={{ paddingLeft: '2.5rem', paddingRight: searchTerm ? '2.5rem' : '1rem' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Pastillas de filtro de tiempo y estado */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              overflowX: 'auto',
              paddingBottom: '0.25rem',
            }}
          >
            <button
              type="button"
              onClick={() => setFilterPreset('all')}
              className={`btn btn-sm ${filterPreset === 'all' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px', whiteSpace: 'nowrap' }}
            >
              Todas ({surveys.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterPreset('today')}
              className={`btn btn-sm ${filterPreset === 'today' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px', whiteSpace: 'nowrap' }}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setFilterPreset('this_week')}
              className={`btn btn-sm ${filterPreset === 'this_week' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px', whiteSpace: 'nowrap' }}
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => setFilterPreset('pending')}
              className={`btn btn-sm ${filterPreset === 'pending' ? 'btn-primary' : 'btn-outline'}`}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                borderRadius: '20px',
                whiteSpace: 'nowrap',
                color: filterPreset === 'pending' ? '#fff' : (pendingCount > 0 ? '#e67e22' : undefined),
                borderColor: pendingCount > 0 && filterPreset !== 'pending' ? 'rgba(230, 126, 34, 0.4)' : undefined,
              }}
            >
              <WifiOff size={13} /> Pendientes ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterPreset('synced')}
              className={`btn btn-sm ${filterPreset === 'synced' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px', whiteSpace: 'nowrap' }}
            >
              <Wifi size={13} /> Sincronizadas ({syncedCount})
            </button>
          </div>

          {/* Resumen de resultados filtrados */}
          {hasActiveFilters && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                borderTop: '1px solid rgba(226, 232, 240, 0.2)',
                paddingTop: '0.5rem',
              }}
            >
              <span>
                Mostrando <strong>{filteredSurveys.length}</strong> de <strong>{surveys.length}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setFilterPreset('all');
                  setSearchTerm('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RotateCcw size={12} /> Restablecer
              </button>
            </div>
          )}
        </div>
      )}

      {surveys.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--background)', borderRadius: '50%', marginBottom: '1rem' }}>
            <User size={48} color="var(--primary)" />
          </div>
          <h3>No hay encuestas registradas</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Presiona el botón flotante para crear la primera encuesta.</p>
        </div>
      ) : filteredSurveys.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <IdCard size={44} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '0.75rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>No se encontraron encuestas</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            No hay encuestas que coincidan con los filtros o el término de búsqueda.
          </p>
          <button
            onClick={() => {
              setFilterPreset('all');
              setSearchTerm('');
            }}
            className="btn btn-outline"
            style={{ marginTop: '1rem' }}
          >
            Ver todas las encuestas
          </button>
        </div>
      ) : (
        <div className="survey-list">
          {filteredSurveys.map(survey => {
            const surveyTime = getSurveyTime(survey);
            return (
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
                    <Calendar size={16} />
                    <span>{survey.fecha_registro}</span>
                    {surveyTime && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, marginLeft: '0.5rem' }}>
                        <Clock size={13} /> {surveyTime}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <Link to={`/edit/${survey.id}`} className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                    Ver / Editar
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link to="/new" className="fab">
        <Plus size={24} />
      </Link>
    </div>
  );
}
