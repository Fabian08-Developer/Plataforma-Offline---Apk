import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FileSpreadsheet,
  Wifi,
  WifiOff,
  User as UserIcon,
  AlertTriangle,
  Clock,
  Filter,
  X,
  RotateCcw,
  Sunrise,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
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
  const { toast } = useToast();

  const [surveys, setSurveys] = useState<SurveyWithEncuestador[]>([]);
  const [encuestadores, setEncuestadores] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros avanzados
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTER_STATE);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal para eliminar
  const [surveyToDelete, setSurveyToDelete] = useState<SurveyWithEncuestador | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      if (navigator.onLine) {
        // Verificar que el backend sea alcanzable antes de intentar fetch
        let backendOk = false;
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2000);
          const ping = await fetch(`${BACKEND_URL}/api/version`, { method: 'HEAD', signal: ctrl.signal });
          clearTimeout(tid);
          backendOk = ping.ok || ping.status < 500;
        } catch {
          backendOk = false;
        }

        if (backendOk) {
          // Cargar todas las encuestas centralizadas
          const resEncuestas = await fetch(`${BACKEND_URL}/api/admin/encuestas`, {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          });
          if (resEncuestas.ok) {
            const data = await resEncuestas.json();
            const serverSurveys = data.encuestas || [];
            setSurveys(serverSurveys);
            // Purgar de SQLite local cualquier encuesta que haya sido eliminada en el servidor
            const activeDocs = serverSurveys.map((s: any) => s.documento_identidad);
            await dbService.purgeDeletedSurveys(activeDocs);
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

  // Restablecer todos los filtros
  const handleResetFilters = () => {
    setFilters(INITIAL_FILTER_STATE);
  };

  // Filtrado reactivo en tiempo real
  const filteredSurveys = useMemo(() => {
    return surveys.filter((s) => matchesFilters(s, filters));
  }, [surveys, filters]);

  // Conteo de filtros activos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.preset !== 'all') count++;
    if (filters.preset === 'custom' && (filters.fechaDesde || filters.fechaHasta)) count++;
    if (filters.horaDesde || filters.horaHasta) count++;
    if (filters.encuestador !== 'all') count++;
    if (filters.estadoSync !== 'all') count++;
    if (filters.searchTerm.trim()) count++;
    return count;
  }, [filters]);

  // Exportar a Excel (XLSX con diseño profesional respetando filtros activos)
  const handleExportXLSX = async () => {
    if (filteredSurveys.length === 0) {
      toast.warning('No hay encuestas para exportar con los filtros actuales.');
      return;
    }

    try {
      const data = filteredSurveys.map((s) => ({
        id:                    s.id ?? '',
        tipo_documento:        s.tipo_documento ?? 'C.C',
        documento_identidad:   s.documento_identidad ?? '',
        nombres:               s.nombres ?? '',
        apellidos:             s.apellidos ?? '',
        telefono_1:            s.telefono_1 ?? '',
        telefono_2:            s.telefono_2 ?? '',
        telefono_3:            s.telefono_3 ?? '',
        direccion:             s.direccion ?? '',
        profesion:             s.profesion ?? '',
        fecha_registro:        s.fecha_registro ?? '',
        hora_registro:         getSurveyTime(s) || '',
        encuestadorNombre:     s.encuestador?.nombre ?? s.encuestador_usuario ?? 'Desconocido',
        estado_sincronizacion: s.estado_sincronizacion ?? 'sincronizado',
      }));

      const dateStr = new Date().toISOString().split('T')[0];
      const filterLabel = filters.preset !== 'all' ? `_${filters.preset}` : '';
      await exportSurveysToExcel(
        data,
        `encuestas_export${filterLabel}_${dateStr}.xlsx`
      );
      toast.success('Archivo Excel descargado con los filtros actuales.');
    } catch (err) {
      console.error('Error al exportar Excel:', err);
      toast.error('No se pudo generar el archivo Excel. Inténtalo de nuevo.');
    }
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

      if (surveyToDelete.documento_identidad) {
        await dbService.deleteSurveyByDocumento(surveyToDelete.documento_identidad);
      }
      if (surveyToDelete.id) {
        await dbService.deleteSurvey(surveyToDelete.id);
      }
      window.dispatchEvent(new Event('surveys-updated'));
      setSurveyToDelete(null);
      toast.success('Encuesta eliminada correctamente.');
      loadData();
    } catch (err) {
      console.error('Error al eliminar encuesta:', err);
      toast.error('Error al eliminar la encuesta.');
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
            onClick={() => navigate('/admin/duplicados')}
            className="btn btn-outline"
            style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#d97706' }}
            title="Revisar posibles encuestas duplicadas o en conflicto"
          >
            <AlertTriangle size={18} /> <span>Revisar Duplicados</span>
          </button>
          <button
            onClick={handleExportXLSX}
            className="btn btn-outline"
            title="Descargar datos en Excel (.xlsx)"
          >
            <FileSpreadsheet size={18} /> <span>Exportar Excel</span>
          </button>
          <button onClick={() => navigate('/admin/new')} className="btn btn-primary">
            <Plus size={18} /> <span>Nueva Encuesta</span>
          </button>
        </div>
      </header>

      {/* Barra de Filtros y Búsqueda Avanzada */}
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
        {/* Fila 1: Búsqueda, Encuestador y Estado Sync */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
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
              value={filters.searchTerm}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchTerm: e.target.value }))}
              placeholder="Buscar por cédula, nombre, teléfono, dirección..."
              className="form-input"
              style={{ paddingLeft: '2.75rem', paddingRight: filters.searchTerm ? '2.5rem' : '1rem' }}
            />
            {filters.searchTerm && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, searchTerm: '' }))}
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
                title="Borrar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filtro por Encuestador */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Users
              size={18}
              style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}
            />
            <select
              value={filters.encuestador}
              onChange={(e) => setFilters((prev) => ({ ...prev, encuestador: e.target.value }))}
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

          {/* Filtro por Estado de Sincronización */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Filter
              size={18}
              style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}
            />
            <select
              value={filters.estadoSync}
              onChange={(e) => setFilters((prev) => ({ ...prev, estadoSync: e.target.value as any }))}
              className="form-input"
              style={{ paddingLeft: '2.75rem' }}
            >
              <option value="all">Todos los estados</option>
              <option value="sincronizado">Solo Sincronizados</option>
              <option value="pendiente">Solo Pendientes</option>
            </select>
          </div>
        </div>

        {/* Fila 2: Presets de Fecha y botón de Franja Horaria */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            paddingTop: '0.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.25rem' }}>
              Fecha:
            </span>
            <button
              type="button"
              onClick={() => handlePresetChange('all')}
              className={`btn btn-sm ${filters.preset === 'all' && !filters.fechaDesde ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px' }}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('today')}
              className={`btn btn-sm ${filters.preset === 'today' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px' }}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('yesterday')}
              className={`btn btn-sm ${filters.preset === 'yesterday' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px' }}
            >
              Ayer
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('this_week')}
              className={`btn btn-sm ${filters.preset === 'this_week' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px' }}
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('this_month')}
              className={`btn btn-sm ${filters.preset === 'this_month' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px' }}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('custom')}
              className={`btn btn-sm ${filters.preset === 'custom' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '20px' }}
            >
              <Calendar size={14} /> Personalizado
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`btn btn-sm btn-outline`}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              borderRadius: '20px',
              borderColor: (filters.horaDesde || filters.horaHasta) ? 'var(--primary)' : undefined,
              color: (filters.horaDesde || filters.horaHasta) ? 'var(--primary)' : undefined,
              fontWeight: (filters.horaDesde || filters.horaHasta) ? 600 : 500,
            }}
          >
            <Clock size={14} />
            <span>Franja Horaria {(filters.horaDesde || filters.horaHasta) ? `(${filters.horaDesde || '00:00'} - ${filters.horaHasta || '23:59'})` : ''}</span>
            {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Panel Expandible de Fechas y Horas */}
        {showAdvancedFilters && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(226, 232, 240, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
              }}
            >
              {/* Rango de Fechas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>a</span>
                  <input
                    type="date"
                    value={filters.fechaHasta}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, preset: 'custom', fechaHasta: e.target.value }))
                    }
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
                  />
                </div>
              </div>

              {/* Rango de Horas ("De una hora a otra") */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Franja Horaria ("De una hora a otra")
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="time"
                    value={filters.horaDesde}
                    onChange={(e) => setFilters((prev) => ({ ...prev, horaDesde: e.target.value }))}
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>a</span>
                  <input
                    type="time"
                    value={filters.horaHasta}
                    onChange={(e) => setFilters((prev) => ({ ...prev, horaHasta: e.target.value }))}
                    className="form-input"
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
                  />
                  {(filters.horaDesde || filters.horaHasta) && (
                    <button
                      type="button"
                      onClick={() => handleSetShift('clear')}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                      title="Quitar filtro de horas"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Accesos rápidos de turnos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Turnos rápidos:</span>
              <button
                type="button"
                onClick={() => handleSetShift('manana')}
                className="btn btn-outline btn-sm"
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: '16px',
                  background: filters.horaDesde === '06:00' && filters.horaHasta === '12:00' ? 'rgba(var(--primary-rgb, 99,102,241), 0.15)' : undefined,
                  borderColor: filters.horaDesde === '06:00' && filters.horaHasta === '12:00' ? 'var(--primary)' : undefined,
                }}
              >
                <Sunrise size={13} color="#f59e0b" /> Mañana (06:00 - 12:00)
              </button>
              <button
                type="button"
                onClick={() => handleSetShift('tarde')}
                className="btn btn-outline btn-sm"
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: '16px',
                  background: filters.horaDesde === '12:00' && filters.horaHasta === '18:00' ? 'rgba(var(--primary-rgb, 99,102,241), 0.15)' : undefined,
                  borderColor: filters.horaDesde === '12:00' && filters.horaHasta === '18:00' ? 'var(--primary)' : undefined,
                }}
              >
                <Sun size={13} color="#3b82f6" /> Tarde (12:00 - 18:00)
              </button>
              <button
                type="button"
                onClick={() => handleSetShift('noche')}
                className="btn btn-outline btn-sm"
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: '16px',
                  background: filters.horaDesde === '18:00' && filters.horaHasta === '23:59' ? 'rgba(var(--primary-rgb, 99,102,241), 0.15)' : undefined,
                  borderColor: filters.horaDesde === '18:00' && filters.horaHasta === '23:59' ? 'var(--primary)' : undefined,
                }}
              >
                <Moon size={13} color="#8b5cf6" /> Noche (18:00 - 23:59)
              </button>
            </div>
          </div>
        )}

        {/* Fila 3: Chips de Filtros Activos */}
        {activeFiltersCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
              paddingTop: '0.25rem',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Filtros activos:
            </span>

            {/* Chip de Fecha / Preset */}
            {filters.preset !== 'all' && (
              <span
                className="badge"
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                <Calendar size={12} />
                {filters.preset === 'today' && 'Hoy'}
                {filters.preset === 'yesterday' && 'Ayer'}
                {filters.preset === 'this_week' && 'Esta semana'}
                {filters.preset === 'this_month' && 'Este mes'}
                {filters.preset === 'custom' && `${filters.fechaDesde || '...'} a ${filters.fechaHasta || '...'}`}
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, preset: 'all', fechaDesde: '', fechaHasta: '' }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Chip de Horas */}
            {(filters.horaDesde || filters.horaHasta) && (
              <span
                className="badge"
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                <Clock size={12} />
                {filters.horaDesde || '00:00'} - {filters.horaHasta || '23:59'}
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, horaDesde: '', horaHasta: '' }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Chip de Encuestador */}
            {filters.encuestador !== 'all' && (
              <span
                className="badge"
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                <Users size={12} />
                {encuestadores.find((u) => String(u.id) === filters.encuestador)?.nombre || 'Encuestador'}
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, encuestador: 'all' }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Chip de Estado Sync */}
            {filters.estadoSync !== 'all' && (
              <span
                className="badge"
                style={{
                  background: filters.estadoSync === 'sincronizado' ? 'rgba(39, 174, 96, 0.15)' : 'rgba(230, 126, 34, 0.15)',
                  color: filters.estadoSync === 'sincronizado' ? '#27ae60' : '#e67e22',
                  border: '1px solid currentColor',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                {filters.estadoSync === 'sincronizado' ? <Wifi size={12} /> : <WifiOff size={12} />}
                {filters.estadoSync === 'sincronizado' ? 'Sincronizados' : 'Pendientes'}
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, estadoSync: 'all' }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {/* Chip de Búsqueda */}
            {filters.searchTerm.trim() && (
              <span
                className="badge"
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#3b82f6',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                <Search size={12} /> "{filters.searchTerm}"
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, searchTerm: '' }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <X size={12} />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                textDecoration: 'underline',
                marginLeft: '0.25rem',
              }}
            >
              Limpiar todo
            </button>
          </div>
        )}

        {/* Resumen de conteo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
            borderTop: '1px solid rgba(226, 232, 240, 0.2)',
            paddingTop: '0.75rem',
          }}
        >
          <span>
            Mostrando <strong>{filteredSurveys.length}</strong> de <strong>{surveys.length}</strong> encuestas registradas
            {activeFiltersCount > 0 && (
              <span style={{ color: 'var(--primary)', fontWeight: 500, marginLeft: '0.5rem' }}>
                ({activeFiltersCount} {activeFiltersCount === 1 ? 'filtro activo' : 'filtros activos'})
              </span>
            )}
          </span>
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="btn btn-outline btn-sm"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <RotateCcw size={13} /> Limpiar filtros
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
            {activeFiltersCount > 0
              ? 'Prueba ajustando los términos de búsqueda o filtros activos.'
              : 'Aún no hay encuestas registradas en el sistema.'}
          </p>
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="btn btn-outline"
              style={{ marginTop: '1rem' }}
            >
              <RotateCcw size={14} /> Restablecer filtros
            </button>
          )}
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
                  {getSurveyTime(survey) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, marginLeft: '0.5rem' }}>
                      <Clock size={13} /> {getSurveyTime(survey)}
                    </span>
                  )}
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
