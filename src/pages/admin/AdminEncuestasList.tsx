import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { dbService, type Survey, type User } from '../../db';
import { useAuth } from '../../context/AuthContext';
import { BACKEND_URL } from '../../config';
import {
  ArrowLeft,
  Plus,
  Search,
  Users,
  Edit,
  Trash2,
  Phone,
  MapPin,
  Calendar,
  IdCard,
  Briefcase,
  Download,
  Wifi,
  WifiOff,
  User as UserIcon,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';

interface SurveyWithEncuestador extends Survey {
  encuestador?: {
    id: number;
    nombre: string;
    usuario: string;
  };
}

export default function AdminEncuestasList() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [surveys, setSurveys] = useState<SurveyWithEncuestador[]>([]);
  const [encuestadores, setEncuestadores] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEncuestador, setSelectedEncuestador] = useState<string>('all');

  // Modal para eliminar
  const [surveyToDelete, setSurveyToDelete] = useState<SurveyWithEncuestador | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      if (navigator.onLine) {
        // Cargar todas las encuestas centralizadas
        const resEncuestas = await fetch(`${BACKEND_URL}/api/admin/encuestas`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (resEncuestas.ok) {
          const data = await resEncuestas.json();
          setSurveys(data.encuestas || []);
        }

        // Cargar lista de encuestadores para el filtro
        const resUsers = await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (resUsers.ok) {
          const users = await resUsers.json();
          setEncuestadores(users || []);
        }

        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Fallback a encuestas locales en SQLite:', err);
    }

    // Fallback local SQLite
    const localSurveys = await dbService.getAllSurveys();
    const localUsers = await dbService.getAllEncuestadores();
    setSurveys(localSurveys);
    setEncuestadores(localUsers);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Filtrado reactivo en tiempo real
  const filteredSurveys = useMemo(() => {
    return surveys.filter((s) => {
      // Filtro por encuestador
      if (selectedEncuestador !== 'all') {
        const encId = s.encuestador_id ? String(s.encuestador_id) : '';
        const encUser = s.encuestador_usuario || s.encuestador?.usuario || '';
        if (encId !== selectedEncuestador && encUser !== selectedEncuestador) {
          return false;
        }
      }

      // Filtro por texto de búsqueda
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const doc = (s.documento_identidad || '').toLowerCase();
      const nombres = (s.nombres || '').toLowerCase();
      const apellidos = (s.apellidos || '').toLowerCase();
      const fullName = `${nombres} ${apellidos}`;
      const tel1 = (s.telefono_1 || '').toLowerCase();
      const tel2 = (s.telefono_2 || '').toLowerCase();
      const tel3 = (s.telefono_3 || '').toLowerCase();
      const dir = (s.direccion || '').toLowerCase();
      const prof = (s.profesion || '').toLowerCase();
      const encName = (s.encuestador?.nombre || '').toLowerCase();

      return (
        doc.includes(term) ||
        fullName.includes(term) ||
        tel1.includes(term) ||
        tel2.includes(term) ||
        tel3.includes(term) ||
        dir.includes(term) ||
        prof.includes(term) ||
        encName.includes(term)
      );
    });
  }, [surveys, searchTerm, selectedEncuestador]);

  // Exportar a CSV
  const handleExportCSV = () => {
    if (filteredSurveys.length === 0) {
      alert('No hay encuestas para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'ID',
      'Tipo Documento',
      'Documento',
      'Nombres',
      'Apellidos',
      'Telefono 1',
      'Telefono 2',
      'Telefono 3',
      'Direccion',
      'Profesion',
      'Fecha Registro',
      'Encuestador',
      'Estado',
    ];

    const rows = filteredSurveys.map((s) => [
      s.id || '',
      `"${s.tipo_documento || 'C.C'}"`,
      `"${s.documento_identidad || ''}"`,
      `"${s.nombres || ''}"`,
      `"${s.apellidos || ''}"`,
      `"${s.telefono_1 || ''}"`,
      `"${s.telefono_2 || ''}"`,
      `"${s.telefono_3 || ''}"`,
      `"${(s.direccion || '').replace(/"/g, '""')}"`,
      `"${(s.profesion || '').replace(/"/g, '""')}"`,
      `"${s.fecha_registro || ''}"`,
      `"${s.encuestador?.nombre || s.encuestador_usuario || 'Desconocido'}"`,
      `"${s.estado_sincronizacion || 'sincronizado'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `encuestas_export_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!surveyToDelete?.id) return;
    setIsDeleting(true);

    try {
      if (navigator.onLine) {
        const authToken = token || localStorage.getItem('auth_token');
        await fetch(`${BACKEND_URL}/api/admin/encuestas/${surveyToDelete.id}`, {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        }).catch(console.warn);
      }

      await dbService.deleteSurvey(surveyToDelete.id);
      setSurveyToDelete(null);
      loadData();
    } catch (err) {
      console.error('Error al eliminar encuesta:', err);
      alert('Error al eliminar la encuesta.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      {/* Header */}
      <header className="page-header">
        <div className="page-header-info">
          <button
            onClick={() => navigate('/admin')}
            className="btn btn-icon btn-outline"
            title="Volver al panel principal"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>
              Gestión de Encuestas
            </h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
              Administra, busca, edita y exporta las encuestas
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportCSV}
            className="btn btn-outline"
            title="Descargar datos en CSV"
          >
            <Download size={18} /> <span>Exportar CSV</span>
          </button>
          <button onClick={() => navigate('/admin/new')} className="btn btn-primary">
            <Plus size={18} /> <span>Nueva Encuesta</span>
          </button>
        </div>
      </header>

      {/* Barra de Filtros y Búsqueda */}
      <div
        className="glass-container"
        style={{
          marginBottom: '1.5rem',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          {/* Input de Búsqueda */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cédula, nombre, teléfono, dirección..."
              className="form-input"
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>

          {/* Filtro por Encuestador */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Users
              size={18}
              style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}
            />
            <select
              value={selectedEncuestador}
              onChange={(e) => setSelectedEncuestador(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '2.75rem' }}
            >
              <option value="all">Todos los encuestadores ({surveys.length})</option>
              {encuestadores.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.nombre} (@{u.usuario})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen de conteo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
            borderTop: '1px solid rgba(226, 232, 240, 0.4)',
            paddingTop: '0.75rem',
          }}
        >
          <span>
            Mostrando <strong>{filteredSurveys.length}</strong> de{' '}
            <strong>{surveys.length}</strong> encuestas registradas
          </span>
          {(searchTerm || selectedEncuestador !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedEncuestador('all');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Lista de Encuestas */}
      {loading ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando encuestas...</p>
        </div>
      ) : filteredSurveys.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <IdCard
            size={48}
            style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '1rem' }}
          />
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>No se encontraron encuestas</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {searchTerm || selectedEncuestador !== 'all'
              ? 'Prueba ajustando los términos de búsqueda o filtros.'
              : 'Aún no hay encuestas registradas en el sistema.'}
          </p>
        </div>
      ) : (
        <div className="survey-list">
          {filteredSurveys.map((survey) => (
            <div key={survey.id} className="glass-container survey-card" style={{ padding: '1.25rem' }}>
              {/* Header de la tarjeta */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1rem',
                  gap: '0.5rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: '0 0 0.25rem 0',
                      fontSize: '1.15rem',
                      fontWeight: 600,
                      wordBreak: 'break-word',
                    }}
                  >
                    {survey.nombres} {survey.apellidos}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      className={`badge ${
                        survey.estado_sincronizacion === 'pendiente'
                          ? 'badge-pending'
                          : 'badge-sync'
                      }`}
                    >
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

                    {/* Tag de Encuestador */}
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--primary)',
                        background: 'rgba(79, 70, 229, 0.08)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <UserIcon size={12} />
                      {survey.encuestador?.nombre || survey.encuestador_usuario || 'Admin'}
                    </span>
                  </div>
                </div>

                {/* Acciones de la Tarjeta (Editar / Eliminar) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                  <button
                    onClick={() => navigate(`/admin/edit/${survey.id}`)}
                    className="btn btn-icon btn-outline"
                    title="Editar Encuesta"
                  >
                    <Edit size={15} />
                  </button>
                  <button
                    onClick={() => setSurveyToDelete(survey)}
                    className="btn btn-icon btn-outline"
                    style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                    title="Eliminar Encuesta"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Información de la persona encuestada */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.9rem',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <IdCard size={16} color="var(--primary)" />
                  <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                    {survey.tipo_documento}: {survey.documento_identidad}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Phone size={16} color="#10b981" />
                  <span style={{ color: 'var(--text-main)' }}>{survey.telefono_1}</span>
                  {survey.telefono_2 && (
                    <span style={{ fontSize: '0.85rem' }}>• {survey.telefono_2}</span>
                  )}
                  {survey.telefono_3 && (
                    <span style={{ fontSize: '0.85rem' }}>• {survey.telefono_3}</span>
                  )}
                </div>

                {survey.direccion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={16} color="#f59e0b" />
                    <span className="truncate-text">{survey.direccion}</span>
                  </div>
                )}

                {survey.profesion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Briefcase size={16} />
                    <span>{survey.profesion}</span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <Calendar size={15} />
                  <span>{survey.fecha_registro}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmación estilizado para eliminar encuesta */}
      <ConfirmModal
        isOpen={!!surveyToDelete}
        title="Eliminar Encuesta"
        message={
          <>
            ¿Estás seguro de que deseas eliminar la encuesta de{' '}
            <strong style={{ color: 'var(--text-main)' }}>
              {surveyToDelete?.nombres} {surveyToDelete?.apellidos}
            </strong>{' '}
            ({surveyToDelete?.tipo_documento}: {surveyToDelete?.documento_identidad})?
            <br />
            <span style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: '0.5rem', display: 'block' }}>
              Esta acción eliminará el registro permanentemente.
            </span>
          </>
        }
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        isDanger={true}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setSurveyToDelete(null);
        }}
      />
    </div>
  );
}
