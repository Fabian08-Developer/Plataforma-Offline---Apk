import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbService, type Survey, type User } from '../../db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { BACKEND_URL } from '../../config';
import { exportSurveysToExcel } from '../../services/exportExcel';
import {
  type FilterState,
  type DatePreset,
  INITIAL_FILTER_STATE,
  matchesFilters,
  getTodayRange,
  getYesterdayRange,
  getThisWeekRange,
  getThisMonthRange,
  getSurveyTime,
} from '../../services/filterUtils';
import {
  ArrowLeft,
  IdCard,
  MapPin,
  Calendar,
  Phone,
  Wifi,
  WifiOff,
  Edit,
  Trash2,
  Briefcase,
  Search,
  X,
  Clock,
  RotateCcw,
  Sunrise,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  LayoutGrid,
  List,
  Sparkles,
  ShieldCheck,
  FileText,
  User as UserIcon,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';

export default function EncuestadorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();

  const [encuestador, setEncuestador] = useState<User | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  // Modo de visualización: Cuadrícula o Tabla
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Filtros avanzados
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTER_STATE);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal para eliminar encuesta
  const [surveyToDelete, setSurveyToDelete] = useState<Survey | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);

    try {
      // 1. Intentar cargar desde el backend centralizado
      const authToken = token || localStorage.getItem('auth_token');
      if (navigator.onLine || authToken) {
        const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores/${id}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        if (res.ok) {
          const data = await res.json();
          if (data.encuestador) {
            setEncuestador(data.encuestador);
            setSurveys(
              (data.encuestas || []).map((s: any) => ({
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
                hora_registro: s.hora_registro,
                creado_en: s.creado_en,
                sincronizado_en: s.sincronizado_en,
                profesion: s.profesion,
                estado_sincronizacion: s.estado_sincronizacion || 'sincronizado',
              }))
            );
            setLoading(false);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Fallback a encuestas locales de SQLite:', err);
    }

    // 2. Fallback local a SQLite
    try {
      const allEncuestadores = await dbService.getAllEncuestadores();
      const found = allEncuestadores.find((e) => e.id === Number(id));

      if (found) {
        setEncuestador(found);
        const data = await dbService.getSurveysByEncuestador(Number(id), found.usuario);
        setSurveys(data);
      }
    } catch (err) {
      console.error('Error cargando encuestador local:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, token]);

  // Manejo de presets rápidos de fecha
  const handlePresetChange = (preset: DatePreset) => {
    if (preset === 'all') {
      setFilters((prev) => ({ ...prev, preset: 'all', fechaDesde: '', fechaHasta: '' }));
      return;
    }
    if (preset === 'today') {
      const { desde, hasta } = getTodayRange();
      setFilters((prev) => ({ ...prev, preset: 'today', fechaDesde: desde, fechaHasta: hasta }));
      return;
    }
    if (preset === 'yesterday') {
      const { desde, hasta } = getYesterdayRange();
      setFilters((prev) => ({ ...prev, preset: 'yesterday', fechaDesde: desde, fechaHasta: hasta }));
      return;
    }
    if (preset === 'this_week') {
      const { desde, hasta } = getThisWeekRange();
      setFilters((prev) => ({ ...prev, preset: 'this_week', fechaDesde: desde, fechaHasta: hasta }));
      return;
    }
    if (preset === 'this_month') {
      const { desde, hasta } = getThisMonthRange();
      setFilters((prev) => ({ ...prev, preset: 'this_month', fechaDesde: desde, fechaHasta: hasta }));
      return;
    }
    if (preset === 'custom') {
      setFilters((prev) => ({ ...prev, preset: 'custom' }));
      setShowAdvancedFilters(true);
      return;
    }
  };

  // Accesos directos de turnos / horas
  const handleSetShift = (shift: 'manana' | 'tarde' | 'noche' | 'clear') => {
    if (shift === 'manana') {
      setFilters((prev) => ({ ...prev, horaDesde: '06:00', horaHasta: '12:00' }));
    } else if (shift === 'tarde') {
      setFilters((prev) => ({ ...prev, horaDesde: '12:00', horaHasta: '18:00' }));
    } else if (shift === 'noche') {
      setFilters((prev) => ({ ...prev, horaDesde: '18:00', horaHasta: '23:59' }));
    } else {
      setFilters((prev) => ({ ...prev, horaDesde: '', horaHasta: '' }));
    }
  };

  // Restablecer filtros
  const handleResetFilters = () => {
    setFilters(INITIAL_FILTER_STATE);
  };

  // Filtrado reactivo en memoria
  const filteredSurveys = useMemo(() => {
    return surveys.filter((survey) => matchesFilters(survey, filters));
  }, [surveys, filters]);

  // Métricas ejecutivas para este encuestador
  const totalSurveys = surveys.length;
  const syncCount = useMemo(
    () => surveys.filter((s) => s.estado_sincronizacion !== 'pendiente').length,
    [surveys]
  );
  const pendingCount = useMemo(
    () => surveys.filter((s) => s.estado_sincronizacion === 'pendiente').length,
    [surveys]
  );
  const syncPercentage = totalSurveys > 0 ? Math.round((syncCount / totalSurveys) * 100) : 100;

  const lastSurvey = useMemo(() => {
    if (surveys.length === 0) return null;
    const sorted = [...surveys].sort((a, b) => (b.id || 0) - (a.id || 0));
    return sorted[0];
  }, [surveys]);

  // Verificar si hay filtros aplicados
  const hasActiveFilters = useMemo(() => {
    return (
      filters.preset !== 'all' ||
      Boolean(filters.fechaDesde) ||
      Boolean(filters.fechaHasta) ||
      Boolean(filters.horaDesde) ||
      Boolean(filters.horaHasta) ||
      filters.estadoSync !== 'all' ||
      Boolean(filters.searchTerm.trim())
    );
  }, [filters]);

  // Exportar encuestas filtradas a Excel
  const handleExportXLSX = async () => {
    if (filteredSurveys.length === 0) {
      toast.error('No hay encuestas para exportar con los filtros actuales');
      return;
    }

    try {
      const sanitizedName = (encuestador?.nombre || 'encuestador')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      const todayStr = new Date().toISOString().split('T')[0];
      const filename = `encuestas_${sanitizedName}_${todayStr}.xlsx`;

      await exportSurveysToExcel(
        filteredSurveys.map((s) => ({
          ...s,
          id: s.id ?? '',
          encuestadorNombre: encuestador?.nombre || 'Encuestador',
        })),
        filename
      );

      toast.success(`Exportadas ${filteredSurveys.length} encuestas exitosamente`);
    } catch (err: any) {
      console.error('Error exportando encuestas a Excel:', err);
      toast.error('Error al generar el archivo Excel');
    }
  };

  // Eliminar encuesta individual
  const handleDeleteSurvey = async () => {
    if (!surveyToDelete) return;
    setIsDeleting(true);

    try {
      const authToken = token || localStorage.getItem('auth_token');
      if (navigator.onLine) {
        await fetch(`${BACKEND_URL}/api/admin/encuestas/${surveyToDelete.id}`, {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
      }

      if (surveyToDelete.documento_identidad) {
        await dbService.deleteSurveyByDocumento(surveyToDelete.documento_identidad);
      } else if (surveyToDelete.id) {
        await dbService.deleteSurvey(surveyToDelete.id);
      }

      setSurveys((prev) => prev.filter((s) => s.id !== surveyToDelete.id));
      setSurveyToDelete(null);
      toast.success('Encuesta eliminada correctamente');
    } catch (err) {
      console.error('Error al eliminar encuesta:', err);
      toast.error('Error al eliminar la encuesta');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="container page-view" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <div className="glass-container" style={{ maxWidth: '480px', margin: '0 auto', padding: '3rem 2rem' }}>
          <Clock size={36} className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto 1rem auto' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Cargando datos del encuestador...</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
            Obteniendo encuestas y registros de actividad
          </p>
        </div>
      </div>
    );
  }

  if (!encuestador) {
    return (
      <div className="container page-view" style={{ paddingTop: '4rem', textAlign: 'center' }}>
        <div className="glass-container" style={{ maxWidth: '480px', margin: '0 auto', padding: '3rem 2rem' }}>
          <UserIcon size={44} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto', opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Encuestador no encontrado</h3>
          <p style={{ color: 'var(--text-muted)', margin: '0 auto 1.5rem auto', fontSize: '0.9rem' }}>
            El operador solicitado no existe o fue eliminado del sistema.
          </p>
          <button
            onClick={() => navigate('/admin/encuestadores')}
            className="btn btn-primary"
            style={{ borderRadius: '12px' }}
          >
            Volver a Lista de Encuestadores
          </button>
        </div>
      </div>
    );
  }

  const surveyorInitial = encuestador.nombre ? encuestador.nombre.charAt(0).toUpperCase() : 'E';

  return (
    <div className="page-view container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      {/* ── Encabezado Principal Responsivo ──────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.75rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            onClick={() => navigate('/admin/encuestadores')}
            className="btn btn-icon btn-outline"
            style={{ borderRadius: '50%' }}
            title="Volver a la lista de encuestadores"
          >
            <ArrowLeft size={20} />
          </button>

          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.25rem',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
              flexShrink: 0,
            }}
          >
            {surveyorInitial}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>
                Encuestas de {encuestador.nombre}
              </h1>
              <span
                style={{
                  background: 'rgba(79, 70, 229, 0.12)',
                  color: 'var(--primary)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                }}
              >
                @{encuestador.usuario}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
              Historial de capturas en terreno • Total recolectadas:{' '}
              <strong style={{ color: 'var(--text-main)' }}>{surveys.length}</strong>
            </p>
          </div>
        </div>

        {/* Acciones de Cabecera */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleExportXLSX}
            disabled={surveys.length === 0}
            className="btn btn-outline"
            title="Exportar las encuestas filtradas a Excel (.xlsx)"
            style={{
              borderColor: 'rgba(34, 197, 94, 0.45)',
              color: '#16a34a',
              opacity: surveys.length === 0 ? 0.5 : 1,
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.88rem',
            }}
          >
            <FileSpreadsheet size={18} />
            <span>Exportar Excel ({filteredSurveys.length})</span>
          </button>
          <button
            onClick={() => navigate('/admin/new')}
            className="btn btn-primary"
            style={{
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}
            title="Registrar nueva encuesta"
          >
            <Plus size={18} />
            <span>Nueva Encuesta</span>
          </button>
        </div>
      </header>

      {/* ── Tira de Métricas Ejecutivas del Encuestador (KPIs) ─────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        {/* KPI 1: Total Recolectadas */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderRadius: '18px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1 }}>
              {totalSurveys}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Total Recolectadas
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Formularios en el sistema
            </div>
          </div>
        </div>

        {/* KPI 2: Sincronizadas al Servidor */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderRadius: '18px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1, color: '#10b981' }}>
              {syncCount}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Sincronizadas
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {syncPercentage}% en servidor central
            </div>
          </div>
        </div>

        {/* KPI 3: Pendientes de Sincronizar */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderRadius: '18px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: pendingCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.12)',
              color: pendingCount > 0 ? '#f59e0b' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <WifiOff size={22} />
          </div>
          <div>
            <div
              style={{
                fontSize: '1.65rem',
                fontWeight: 800,
                lineHeight: 1.1,
                color: pendingCount > 0 ? '#f59e0b' : 'var(--text-main)',
              }}
            >
              {pendingCount}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Pendientes Locales
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {pendingCount > 0 ? 'Guardadas en SQLite local' : '100% al día con la nube'}
            </div>
          </div>
        </div>

        {/* KPI 4: Última Captura en Campo */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            borderRadius: '18px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'rgba(168, 85, 247, 0.12)',
              color: '#a855f7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.2 }}>
              {lastSurvey?.hora_registro || lastSurvey?.fecha_registro || 'Sin actividad'}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Última Actividad
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {lastSurvey ? `Fecha: ${lastSurvey.fecha_registro}` : 'Aún sin registros'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra de Filtros y Búsqueda con Curvas Suaves (Pills) ─────────────── */}
      <div
        className="glass-container"
        style={{
          marginBottom: '1.75rem',
          padding: '1.25rem',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Fila 1: Búsqueda, Estado de Sincronización y Switch de Vista */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.85rem',
          }}
        >
          {/* Input de Búsqueda Curvado */}
          <div
            style={{
              position: 'relative',
              flex: '1 1 300px',
              minWidth: '240px',
            }}
          >
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))}
              placeholder="Buscar por cédula, nombre, teléfono, dirección..."
              className="form-input"
              style={{
                paddingLeft: '2.6rem',
                paddingRight: filters.searchTerm ? '2.5rem' : '1rem',
                width: '100%',
                margin: 0,
                borderRadius: '9999px',
              }}
            />
            {filters.searchTerm && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, searchTerm: '' }))}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  borderRadius: '50%',
                }}
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Segmented Pills de Sincronización */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'var(--surface-sunken, rgba(0,0,0,0.04))',
              padding: '0.3rem',
              borderRadius: '9999px',
              border: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, estadoSync: 'all' }))}
              style={{
                background: filters.estadoSync === 'all' ? 'var(--primary)' : 'transparent',
                color: filters.estadoSync === 'all' ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: filters.estadoSync === 'all' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
              }}
            >
              Todas ({totalSurveys})
            </button>
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, estadoSync: 'sincronizado' }))}
              style={{
                background: filters.estadoSync === 'sincronizado' ? 'var(--primary)' : 'transparent',
                color: filters.estadoSync === 'sincronizado' ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow:
                  filters.estadoSync === 'sincronizado' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
              }}
            >
              Sincronizadas ({syncCount})
            </button>
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, estadoSync: 'pendiente' }))}
              style={{
                background: filters.estadoSync === 'pendiente' ? '#f59e0b' : 'transparent',
                color: filters.estadoSync === 'pendiente' ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow:
                  filters.estadoSync === 'pendiente' ? '0 2px 8px rgba(245, 158, 11, 0.35)' : 'none',
              }}
            >
              Pendientes ({pendingCount})
            </button>
          </div>

          {/* Switch de Vista: Cuadrícula / Tabla */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'var(--surface-sunken, rgba(0,0,0,0.04))',
              padding: '0.25rem',
              borderRadius: '9999px',
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                background: viewMode === 'grid' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--primary)' : 'var(--text-muted)',
                border: 'none',
                padding: '0.45rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: viewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
              title="Vista en tarjetas (Cuadrícula)"
            >
              <LayoutGrid size={15} />
              <span>Tarjetas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'table' ? 'var(--primary)' : 'var(--text-muted)',
                border: 'none',
                padding: '0.45rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: viewMode === 'table' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
              title="Vista en lista detallada (Tabla)"
            >
              <List size={15} />
              <span>Tabla</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Presets de Fecha y Acceso a Horarios */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.65rem',
            paddingTop: '0.25rem',
          }}
        >
          {/* Pestañas de Fecha */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginRight: '0.25rem',
              }}
            >
              Fecha:
            </span>
            <button
              type="button"
              onClick={() => handlePresetChange('all')}
              style={{
                background: filters.preset === 'all' && !filters.fechaDesde ? 'var(--primary)' : 'transparent',
                color: filters.preset === 'all' && !filters.fechaDesde ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('today')}
              style={{
                background: filters.preset === 'today' ? 'var(--primary)' : 'transparent',
                color: filters.preset === 'today' ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('yesterday')}
              style={{
                background: filters.preset === 'yesterday' ? 'var(--primary)' : 'transparent',
                color: filters.preset === 'yesterday' ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Ayer
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('this_week')}
              style={{
                background: filters.preset === 'this_week' ? 'var(--primary)' : 'transparent',
                color: filters.preset === 'this_week' ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('this_month')}
              style={{
                background: filters.preset === 'this_month' ? 'var(--primary)' : 'transparent',
                color: filters.preset === 'this_month' ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('custom')}
              style={{
                background: filters.preset === 'custom' ? 'var(--primary)' : 'transparent',
                color: filters.preset === 'custom' ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Calendar size={13} /> Personalizado
            </button>
          </div>

          {/* Botón Franja Horaria */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            style={{
              background: filters.horaDesde || filters.horaHasta ? 'rgba(79, 70, 229, 0.12)' : 'transparent',
              color: filters.horaDesde || filters.horaHasta ? 'var(--primary)' : 'var(--text-main)',
              border: '1px solid',
              borderColor: filters.horaDesde || filters.horaHasta ? 'var(--primary)' : 'var(--border)',
              padding: '0.4rem 0.95rem',
              fontSize: '0.82rem',
              borderRadius: '9999px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Clock size={15} />
            <span>
              Franja Horaria{' '}
              {filters.horaDesde || filters.horaHasta
                ? `(${filters.horaDesde || '00:00'} - ${filters.horaHasta || '23:59'})`
                : ''}
            </span>
            {showAdvancedFilters ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Panel Expandible de Fechas y Horas */}
        {showAdvancedFilters && (
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '1.15rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
              }}
            >
              {/* Rango de Fechas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Rango de Fechas (Desde - Hasta)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={filters.fechaDesde}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, preset: 'custom', fechaDesde: e.target.value }))
                    }
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem', borderRadius: '12px', margin: 0 }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>a</span>
                  <input
                    type="date"
                    value={filters.fechaHasta}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, preset: 'custom', fechaHasta: e.target.value }))
                    }
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem', borderRadius: '12px', margin: 0 }}
                  />
                </div>
              </div>

              {/* Rango de Horas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Franja Horaria ("De una hora a otra")
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="time"
                    value={filters.horaDesde}
                    onChange={(e) => setFilters((prev) => ({ ...prev, horaDesde: e.target.value }))}
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem', borderRadius: '12px', margin: 0 }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>a</span>
                  <input
                    type="time"
                    value={filters.horaHasta}
                    onChange={(e) => setFilters((prev) => ({ ...prev, horaHasta: e.target.value }))}
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem', borderRadius: '12px', margin: 0 }}
                  />
                </div>
              </div>
            </div>

            {/* Accesos directos a Turnos de Trabajo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Turnos habituales:
              </span>
              <button
                type="button"
                onClick={() => handleSetShift('manana')}
                style={{
                  background:
                    filters.horaDesde === '06:00' && filters.horaHasta === '12:00'
                      ? 'var(--primary)'
                      : 'transparent',
                  color:
                    filters.horaDesde === '06:00' && filters.horaHasta === '12:00'
                      ? '#ffffff'
                      : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Sunrise size={13} /> Mañana (06:00 - 12:00)
              </button>
              <button
                type="button"
                onClick={() => handleSetShift('tarde')}
                style={{
                  background:
                    filters.horaDesde === '12:00' && filters.horaHasta === '18:00'
                      ? 'var(--primary)'
                      : 'transparent',
                  color:
                    filters.horaDesde === '12:00' && filters.horaHasta === '18:00'
                      ? '#ffffff'
                      : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Sun size={13} /> Tarde (12:00 - 18:00)
              </button>
              <button
                type="button"
                onClick={() => handleSetShift('noche')}
                style={{
                  background:
                    filters.horaDesde === '18:00' && filters.horaHasta === '23:59'
                      ? 'var(--primary)'
                      : 'transparent',
                  color:
                    filters.horaDesde === '18:00' && filters.horaHasta === '23:59'
                      ? '#ffffff'
                      : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Moon size={13} /> Noche (18:00 - 23:59)
              </button>
              {(filters.horaDesde || filters.horaHasta) && (
                <button
                  type="button"
                  onClick={() => handleSetShift('clear')}
                  style={{
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.78rem',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                  title="Limpiar horas"
                >
                  <X size={12} /> Limpiar Horario
                </button>
              )}
            </div>
          </div>
        )}

        {/* Fila 3: Resumen y Chips de Filtros Activos */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            borderTop: '1px solid rgba(226, 232, 240, 0.1)',
            paddingTop: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Mostrando <strong style={{ color: 'var(--text-main)' }}>{filteredSurveys.length}</strong> de{' '}
              {surveys.length} encuestas
              {hasActiveFilters && ' (Filtros aplicados)'}
            </span>

            {/* Chips de filtros activos */}
            {filters.searchTerm && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(79, 70, 229, 0.12)',
                  color: 'var(--primary)',
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                Búsqueda: "{filters.searchTerm}"
                <X
                  size={12}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFilters((p) => ({ ...p, searchTerm: '' }))}
                />
              </span>
            )}

            {filters.preset !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(79, 70, 229, 0.12)',
                  color: 'var(--primary)',
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                {filters.preset === 'today' && 'Hoy'}
                {filters.preset === 'yesterday' && 'Ayer'}
                {filters.preset === 'this_week' && 'Esta Semana'}
                {filters.preset === 'this_month' && 'Este Mes'}
                {filters.preset === 'custom' &&
                  `Rango: ${filters.fechaDesde || 'inicio'} a ${filters.fechaHasta || 'fin'}`}
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => handlePresetChange('all')} />
              </span>
            )}

            {(filters.horaDesde || filters.horaHasta) && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                Horario: {filters.horaDesde || '00:00'} - {filters.horaHasta || '23:59'}
                <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleSetShift('clear')} />
              </span>
            )}

            {filters.estadoSync !== 'all' && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#d97706',
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                Estado: {filters.estadoSync}
                <X
                  size={12}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFilters((p) => ({ ...p, estadoSync: 'all' }))}
                />
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                padding: '0.35rem 0.85rem',
                fontSize: '0.78rem',
                borderRadius: '9999px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: 'var(--text-muted)',
              }}
            >
              <RotateCcw size={13} /> Restablecer filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido Principal: Lista de Encuestas (Grid o Table) ───────────── */}
      {surveys.length === 0 ? (
        <div
          className="glass-container"
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            borderRadius: '20px',
            border: '2px dashed var(--border)',
          }}
        >
          <FileText size={44} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto', opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Sin actividad registrada</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 1.5rem auto', fontSize: '0.9rem' }}>
            Este encuestador aún no ha recolectado encuestas en el sistema. Puedes asignarle rutas de campo o crear un formulario nuevo.
          </p>
          <button
            onClick={() => navigate('/admin/new')}
            className="btn btn-primary"
            style={{ borderRadius: '12px' }}
          >
            <Plus size={16} /> Crear primera encuesta
          </button>
        </div>
      ) : filteredSurveys.length === 0 ? (
        <div
          className="glass-container"
          style={{
            textAlign: 'center',
            padding: '3.5rem 2rem',
            borderRadius: '20px',
            border: '2px dashed var(--border)',
          }}
        >
          <Search size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem auto' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>No se encontraron encuestas</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '480px', margin: '0.5rem auto 1.5rem auto', fontSize: '0.9rem' }}>
            Ninguna encuesta de este encuestador coincide con los filtros aplicados (búsqueda, fechas o franja
            horaria).
          </p>
          <button
            onClick={handleResetFilters}
            className="btn btn-outline"
            style={{ borderRadius: '12px' }}
          >
            <RotateCcw size={16} /> Restablecer filtros
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Vista en Cuadrícula (Cards) ── */
        <div className="survey-list">
          {filteredSurveys.map((survey) => {
            const surveyTime = getSurveyTime(survey);
            const initial = survey.nombres ? survey.nombres.charAt(0).toUpperCase() : 'C';

            return (
              <div key={survey.id} className="glass-container survey-card" style={{ borderRadius: '20px', padding: '1.35rem' }}>
                {/* Cabecera de la Tarjeta */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0ea5e9, #10b981)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1.15rem',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.25)',
                      }}
                    >
                      {initial}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.25 }}>
                        {survey.nombres} {survey.apellidos}
                      </h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        ID: #{survey.id}
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Edición y Eliminación */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      onClick={() => navigate(`/admin/edit/${survey.id}`)}
                      className="btn btn-icon btn-outline"
                      title="Editar Encuesta"
                      style={{ padding: '0.45rem', borderRadius: '50%' }}
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      onClick={() => setSurveyToDelete(survey)}
                      className="btn btn-icon btn-outline"
                      title="Eliminar Encuesta"
                      style={{
                        padding: '0.45rem',
                        borderRadius: '50%',
                        color: '#ef4444',
                        borderColor: 'rgba(239, 68, 68, 0.35)',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Badges de Sincronización y Tiempo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      background:
                        survey.estado_sincronizacion === 'pendiente'
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(16, 185, 129, 0.12)',
                      color: survey.estado_sincronizacion === 'pendiente' ? '#d97706' : '#10b981',
                      border:
                        survey.estado_sincronizacion === 'pendiente'
                          ? '1px solid rgba(245, 158, 11, 0.25)'
                          : '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    {survey.estado_sincronizacion === 'pendiente' ? (
                      <>
                        <WifiOff size={13} /> Pendiente
                      </>
                    ) : (
                      <>
                        <Wifi size={13} /> Sincronizado
                      </>
                    )}
                  </span>

                  {surveyTime && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        background: 'var(--surface-sunken, rgba(0,0,0,0.04))',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        border: '1px solid var(--border)',
                      }}
                      title="Hora exacta de captura"
                    >
                      <Clock size={12} /> {surveyTime}
                    </span>
                  )}
                </div>

                {/* Bloque de Información del Ciudadano */}
                <div
                  style={{
                    background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '0.95rem 1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    fontSize: '0.88rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <IdCard size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {survey.tipo_documento}: {survey.documento_identidad}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <Phone size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span>
                      {[survey.telefono_1, survey.telefono_2, survey.telefono_3].filter(Boolean).join(' • ') ||
                        'Sin teléfono'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <MapPin size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {survey.direccion || 'Sin dirección registrada'}
                    </span>
                  </div>

                  {survey.profesion && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Briefcase size={16} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                      <span>{survey.profesion}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <Calendar size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span>{survey.fecha_registro}</span>
                  </div>
                </div>

                {/* Pie de Tarjeta con Botón de Acción */}
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => navigate(`/admin/edit/${survey.id}`)}
                    className="btn btn-outline"
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      padding: '0.6rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    <Edit size={14} /> Editar Formulario
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Vista en Tabla Detallada ── */
        <div
          className="glass-container"
          style={{
            borderRadius: '20px',
            padding: '1.25rem',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Ciudadano</th>
                <th style={{ padding: '0.75rem 1rem' }}>Documento</th>
                <th style={{ padding: '0.75rem 1rem' }}>Teléfono</th>
                <th style={{ padding: '0.75rem 1rem' }}>Dirección</th>
                <th style={{ padding: '0.75rem 1rem' }}>Fecha & Hora</th>
                <th style={{ padding: '0.75rem 1rem' }}>Estado</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSurveys.map((survey) => {
                const surveyTime = getSurveyTime(survey);

                return (
                  <tr
                    key={survey.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <strong style={{ color: 'var(--text-main)', display: 'block' }}>
                        {survey.nombres} {survey.apellidos}
                      </strong>
                      {survey.profesion && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {survey.profesion}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                      {survey.tipo_documento}: {survey.documento_identidad}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                      {survey.telefono_1 || 'Sin teléfono'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {survey.direccion || 'Sin dirección'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div>{survey.fecha_registro}</div>
                      {surveyTime && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {surveyTime}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.65rem',
                          borderRadius: '9999px',
                          background:
                            survey.estado_sincronizacion === 'pendiente'
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'rgba(16, 185, 129, 0.12)',
                          color: survey.estado_sincronizacion === 'pendiente' ? '#d97706' : '#10b981',
                        }}
                      >
                        {survey.estado_sincronizacion === 'pendiente' ? 'Pendiente' : 'Sincronizado'}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => navigate(`/admin/edit/${survey.id}`)}
                          className="btn btn-icon btn-outline"
                          title="Editar"
                          style={{ padding: '0.4rem', borderRadius: '50%' }}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => setSurveyToDelete(survey)}
                          className="btn btn-icon btn-outline"
                          title="Eliminar"
                          style={{
                            padding: '0.4rem',
                            borderRadius: '50%',
                            color: '#ef4444',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Panel de Auditoría y Resguardo de Campo (Equilibrio en Pantallas Grandes) ── */}
      <div
        className="glass-container"
        style={{
          marginTop: '2.5rem',
          padding: '1.5rem',
          borderRadius: '20px',
          border: '1px solid rgba(99, 102, 241, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
              Auditoría y Supervisión del Encuestador
            </h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.82rem' }}>
              Seguimiento de tiempos de captura, integridad y reportes oficiales
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Tarjeta 1 */}
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '1.15rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Clock size={17} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                Trazabilidad por Horas y Turnos
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Cada formulario guarda la hora y fecha exacta en la que fue levantado en el dispositivo del encuestador, facilitando auditorías de ritmo y jornada laboral.
            </p>
          </div>

          {/* Tarjeta 2 */}
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '1.15rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <FileSpreadsheet size={17} style={{ color: '#10b981' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                Exportación Oficial en Excel
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              El botón <em>"Exportar Excel"</em> respeta los filtros activos y genera un libro `.xlsx` con todas las columnas de identificación, contacto y sincronización.
            </p>
          </div>

          {/* Tarjeta 3 */}
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '1.15rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={17} style={{ color: '#0ea5e9' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                Resguardo y Reconciliación
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Las encuestas recopiladas en zonas sin conectividad se marcan automáticamente como <em>Pendientes</em> y se suben al servidor central tan pronto se detecte conexión.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal de Confirmación para Eliminar Encuesta ──────────────────────── */}
      <ConfirmModal
        isOpen={Boolean(surveyToDelete)}
        title="¿Eliminar Encuesta?"
        message={
          surveyToDelete ? (
            <div>
              <p style={{ margin: '0 0 0.5rem 0' }}>
                Estás a punto de eliminar la encuesta de{' '}
                <strong style={{ color: 'var(--text-main)' }}>
                  {surveyToDelete.nombres} {surveyToDelete.apellidos}
                </strong>{' '}
                (<span style={{ color: 'var(--primary)', fontWeight: 600 }}>{surveyToDelete.documento_identidad}</span>).
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#ef4444' }}>
                Esta acción es irreversible y eliminará el registro de la base de datos centralizada y de la memoria local de la aplicación.
              </p>
            </div>
          ) : (
            ''
          )
        }
        confirmText="Sí, eliminar definitivamente"
        cancelText="Cancelar"
        isDanger={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteSurvey}
        onCancel={() => setSurveyToDelete(null)}
      />
    </div>
  );
}
