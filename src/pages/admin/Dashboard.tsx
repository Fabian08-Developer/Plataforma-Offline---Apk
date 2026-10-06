import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dbService } from '../../db';
import type { Survey, User } from '../../db';
import { BACKEND_URL } from '../../config';
import {
  Users,
  FileText,
  Wifi,
  WifiOff,
  LogOut,
  DownloadCloud,
  ChevronRight,
  AlertTriangle,
  Plus,
  ArrowRight,
  Calendar,
  Clock,
  IdCard,
  Edit,
} from 'lucide-react';
import { getSurveyTime } from '../../services/filterUtils';

interface SurveyWithEncuestador extends Survey {
  encuestador?: {
    id: number;
    nombre: string;
    usuario: string;
  };
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [surveys, setSurveys] = useState<SurveyWithEncuestador[]>([]);
  const [encuestadores, setEncuestadores] = useState<User[]>([]);
  const [totalDuplicados, setTotalDuplicados] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        if (token) {
          const res = await fetch(`${BACKEND_URL}/api/admin/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.encuestas) {
              setSurveys(
                data.encuestas.map((e: any) => ({
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
                  hora_registro: e.hora_registro,
                  creado_en: e.creado_en,
                  sincronizado_en: e.sincronizado_en,
                  profesion: e.profesion,
                  encuestador: e.encuestador,
                  estado_sincronizacion: e.estado_sincronizacion || 'sincronizado',
                }))
              );
            }

            if (typeof data.totalDuplicados === 'number') {
              setTotalDuplicados(data.totalDuplicados);
            }

            const encRes = await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
              headers: { Authorization: `Bearer ${token}` },
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

      // Fallback a SQLite local
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

  const pendingCount = surveys.filter((s) => s.estado_sincronizacion === 'pendiente').length;
  const syncedCount = surveys.filter((s) => s.estado_sincronizacion === 'sincronizado').length;
  const syncedPercent = surveys.length > 0 ? Math.round((syncedCount / surveys.length) * 100) : 100;

  return (
    <div className="page-view container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      {/* ── Header Principal con Saludo y Acciones ── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div>
          <h1 className="app-title" style={{ fontSize: '2rem', margin: 0, lineHeight: 1.2 }}>
            Panel de Control
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
            Bienvenido, <strong style={{ color: 'var(--text-main)' }}>{user?.nombre}</strong> (Administrador)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/admin/new')}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.1rem', fontSize: '0.9rem' }}
            title="Crear encuesta directamente"
          >
            <Plus size={16} /> Nueva Encuesta
          </button>

          <button
            onClick={handleLogout}
            className="btn btn-outline"
            style={{
              padding: '0.55rem 1rem',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
            }}
            title="Cerrar sesión"
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      {/* ── Sección 1: Indicadores Clave de Operación (KPIs en 4 Columnas Equilibradas) ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* KPI 1: Total Encuestas */}
          <Link to="/admin/encuestas" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div
              className="glass-container"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                border: '1px solid rgba(79, 70, 229, 0.35)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Total Encuestas
                </span>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(79, 70, 229, 0.12)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FileText size={22} />
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: '2.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', lineHeight: 1.1 }}>
                  {surveys.length}
                </h2>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    marginTop: '0.5rem',
                  }}
                >
                  Ver y filtrar encuestas <ArrowRight size={13} />
                </span>
              </div>
            </div>
          </Link>

          {/* KPI 2: Sincronizadas */}
          <div
            className="glass-container"
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Sincronizadas
              </span>
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
                }}
              >
                <Wifi size={22} />
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 700, margin: 0, color: '#10b981', lineHeight: 1.1 }}>
                {syncedCount}
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
                {syncedPercent}% en la base de datos central
              </span>
            </div>
          </div>

          {/* KPI 3: Pendientes */}
          <div
            className="glass-container"
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              border: pendingCount > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Pendientes de Sync
              </span>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <WifiOff size={22} />
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: '2.25rem', fontWeight: 700, margin: 0, color: pendingCount > 0 ? '#f59e0b' : 'var(--text-main)', lineHeight: 1.1 }}>
                {pendingCount}
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>
                {pendingCount === 0 ? 'Al día con el servidor' : 'Esperando sincronización'}
              </span>
            </div>
          </div>

          {/* KPI 4: Posibles Duplicados */}
          <Link to="/admin/duplicados" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div
              className="glass-container"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                border: totalDuplicados > 0 ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid var(--border)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Posibles Duplicados
                </span>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: totalDuplicados > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                    color: totalDuplicados > 0 ? '#ef4444' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertTriangle size={22} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h2
                    style={{
                      fontSize: '2.25rem',
                      fontWeight: 700,
                      margin: 0,
                      color: totalDuplicados > 0 ? '#ef4444' : 'var(--text-main)',
                      lineHeight: 1.1,
                    }}
                  >
                    {totalDuplicados}
                  </h2>
                  {totalDuplicados > 0 ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        background: '#ef4444',
                        color: 'white',
                      }}
                    >
                      Por revisar
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981',
                      }}
                    >
                      Limpio
                    </span>
                  )}
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.78rem',
                    color: totalDuplicados > 0 ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: 600,
                    marginTop: '0.5rem',
                  }}
                >
                  Auditar y resolver <ArrowRight size={13} />
                </span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Sección 2: Módulos de Gestión (3 Columnas de Acceso Rápido) ── */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Módulos de Gestión</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>• Herramientas operativas</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Módulo A: Encuestadores */}
          <div
            className="glass-container"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
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
                  <Users size={24} />
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: 'rgba(79, 70, 229, 0.1)',
                    color: 'var(--primary)',
                    padding: '3px 10px',
                    borderRadius: '20px',
                  }}
                >
                  {encuestadores.length} activo{encuestadores.length !== 1 ? 's' : ''}
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.35rem 0' }}>
                Equipo de Encuestadores
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: '0 0 1.25rem 0' }}>
                Administra cuentas, supervisa encuestas individuales por encuestador y gestiona credenciales de acceso.
              </p>
            </div>

            <Link
              to="/admin/encuestadores"
              className="btn btn-outline"
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.65rem 1rem',
                fontSize: '0.88rem',
              }}
            >
              <span>Ver Encuestadores</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* Módulo B: Actualizaciones APK */}
          <div
            className="glass-container"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DownloadCloud size={24} />
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    padding: '3px 10px',
                    borderRadius: '20px',
                  }}
                >
                  Móvil APK
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.35rem 0' }}>
                Actualizaciones de la App
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: '0 0 1.25rem 0' }}>
                Publica nuevas versiones APK para que los dispositivos en campo descarguen e instalen actualizaciones de forma segura.
              </p>
            </div>

            <Link
              to="/admin/actualizaciones"
              className="btn btn-outline"
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.65rem 1rem',
                fontSize: '0.88rem',
              }}
            >
              <span>Subir y Gestionar APK</span>
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* Módulo C: Auditoría de Duplicados */}
          <div
            className="glass-container"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: totalDuplicados > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: totalDuplicados > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    color: totalDuplicados > 0 ? '#ef4444' : '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertTriangle size={24} />
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: totalDuplicados > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    color: totalDuplicados > 0 ? '#ef4444' : '#f59e0b',
                    padding: '3px 10px',
                    borderRadius: '20px',
                  }}
                >
                  {totalDuplicados} caso{totalDuplicados !== 1 ? 's' : ''}
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.35rem 0' }}>
                Bandeja de Duplicados
              </h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: '0 0 1.25rem 0' }}>
                Revisa cédulas repetidas o nombres con similitud fonética/ortográfica para aprobarlos, fusionar teléfonos o descartar.
              </p>
            </div>

            <Link
              to="/admin/duplicados"
              className="btn btn-outline"
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.65rem 1rem',
                fontSize: '0.88rem',
                borderColor: totalDuplicados > 0 ? 'rgba(239, 68, 68, 0.4)' : undefined,
                color: totalDuplicados > 0 ? '#ef4444' : undefined,
              }}
            >
              <span>Revisar Duplicados</span>
              <ChevronRight size={16} />
            </Link>
            <Link
              to="/admin/avisos-cedula"
              className="btn btn-outline"
              style={{ width: '100%', justifyContent: 'space-between', padding: '0.65rem 1rem', fontSize: '0.88rem', marginTop: '0.5rem' }}
            >
              <span>Avisos de cédula repetida</span>
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Sección 3: Últimas Encuestas Registradas ── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
              Últimas Encuestas Registradas
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Mostrando los registros más recientes en la base de datos
            </p>
          </div>

          <Link
            to="/admin/encuestas"
            className="btn btn-outline"
            style={{ padding: '0.45rem 0.95rem', fontSize: '0.85rem', gap: '0.35rem' }}
          >
            <span>Ver Todas ({surveys.length})</span>
            <ChevronRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>Cargando encuestas centralizadas...</p>
          </div>
        ) : surveys.length === 0 ? (
          <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              No hay encuestas registradas en la base de datos.
            </p>
            <button onClick={() => navigate('/admin/new')} className="btn btn-primary">
              <Plus size={16} /> Registrar Primera Encuesta
            </button>
          </div>
        ) : (
          <div className="glass-container" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.03)' }}>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Documento</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Nombre Completo</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Encuestador</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Fecha y Hora</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>Estado</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {surveys.slice(0, 5).map((s) => {
                    const time = getSurveyTime(s);
                    const encName = s.encuestador?.nombre || s.encuestador_usuario || 'Central';

                    return (
                      <tr
                        key={s.id}
                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                            <IdCard size={15} style={{ color: 'var(--text-muted)' }} />
                            {s.tipo_documento}: {s.documento_identidad}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                          {s.nombres} {s.apellidos}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                          <span
                            style={{
                              background: 'rgba(79, 70, 229, 0.08)',
                              color: 'var(--primary)',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                            }}
                          >
                            {encName}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={14} /> {s.fecha_registro}
                            </span>
                            {time && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <Clock size={12} /> {time}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span
                            className={`badge ${s.estado_sincronizacion === 'pendiente' ? 'badge-pending' : 'badge-sync'}`}
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                          >
                            {s.estado_sincronizacion === 'pendiente' ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <WifiOff size={11} /> Pendiente
                              </span>
                            ) : (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Wifi size={11} /> Sincronizado
                              </span>
                            )}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => navigate(`/admin/edit/${s.id}`)}
                            className="btn btn-icon btn-outline"
                            title="Editar Encuesta"
                            style={{ padding: '0.4rem' }}
                          >
                            <Edit size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
