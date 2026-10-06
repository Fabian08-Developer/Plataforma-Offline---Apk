import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dbService } from '../../db';
import type { User } from '../../db';
import { useToast } from '../../context/ToastContext';
import { BACKEND_URL } from '../../config';
import {
  ArrowLeft,
  UserPlus,
  Trash2,
  Edit2,
  ChevronRight,
  Save,
  X,
  Search,
  Users,
  ClipboardCheck,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Calendar,
  User as UserIcon,
  ShieldCheck,
  Sparkles,
  FileText,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';

interface EncuestadorItem extends User {
  estado?: boolean;
  creado_en?: string;
  total_encuestas?: number;
  _count?: { encuestas: number };
}

export default function EncuestadoresList() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [encuestadores, setEncuestadores] = useState<EncuestadorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'with_surveys' | 'no_surveys'>('all');

  // Modal para Crear / Editar
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nombre: '', usuario: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modal para Eliminar (con protección de contraseña si tiene encuestas)
  const [userToDelete, setUserToDelete] = useState<EncuestadorItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [surveysCount, setSurveysCount] = useState(0);

  const loadEncuestadores = async () => {
    try {
      let list: EncuestadorItem[] = [];

      // 1. Intentar cargar desde el backend si estamos online
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const remoteUsers: any[] = await res.json();
          list = remoteUsers.map((u) => ({
            ...u,
            total_encuestas: u._count?.encuestas ?? 0,
          }));

          // Sincronizar en SQLite local en segundo plano
          for (const u of remoteUsers) {
            try {
              const localU = await dbService.getUserByCredentials(u.usuario);
              if (!localU) {
                // Sin contraseña: el encuestador debe iniciar sesión en línea una vez para habilitar el acceso offline
                await dbService.addUsuario({
                  nombre: u.nombre,
                  usuario: u.usuario,
                  rol: 'encuestador',
                });
              }
            } catch {
              // Silencioso para no bloquear la carga
            }
          }
        }
      }

      // 2. Si no hubo datos del backend (offline o error), recurrir a SQLite local
      if (list.length === 0) {
        const localUsers = await dbService.getAllEncuestadores();
        list = await Promise.all(
          localUsers.map(async (u) => {
            let count = 0;
            try {
              const s = await dbService.getSurveysByEncuestador(u.id, u.usuario);
              count = s.length;
            } catch {
              count = 0;
            }
            return {
              ...u,
              total_encuestas: count,
            };
          })
        );
      } else {
        // Enriquecer con encuestas locales pendientes que aún no se hayan subido al servidor
        list = await Promise.all(
          list.map(async (u) => {
            try {
              const localSurveys = await dbService.getSurveysByEncuestador(u.id, u.usuario);
              const maxCount = Math.max(u.total_encuestas || 0, localSurveys.length);
              return { ...u, total_encuestas: maxCount };
            } catch {
              return u;
            }
          })
        );
      }

      setEncuestadores(list);
    } catch (err) {
      console.warn('Fallback a encuestadores locales de SQLite:', err);
      try {
        const localUsers = await dbService.getAllEncuestadores();
        const enriched = await Promise.all(
          localUsers.map(async (u) => {
            let count = 0;
            try {
              const s = await dbService.getSurveysByEncuestador(u.id, u.usuario);
              count = s.length;
            } catch {
              count = 0;
            }
            return { ...u, total_encuestas: count };
          })
        );
        setEncuestadores(enriched);
      } catch (innerErr) {
        console.error('Error cargando encuestadores locales:', innerErr);
      }
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    loadEncuestadores();
  }, []);

  const handleRefresh = async () => {
    setReloading(true);
    await loadEncuestadores();
    toast.success('Lista de encuestadores actualizada');
  };

  // Cálculos estadísticos para KPIs ejecutivos
  const totalEncuestadores = encuestadores.length;
  const totalEncuestas = encuestadores.reduce((acc, curr) => acc + (curr.total_encuestas || 0), 0);
  const encuestadoresActivos = encuestadores.filter((e) => e.estado !== false).length;
  const promedioPorEncuestador =
    totalEncuestadores > 0 ? (totalEncuestas / totalEncuestadores).toFixed(1) : '0';

  const withSurveysCount = useMemo(
    () => encuestadores.filter((e) => (e.total_encuestas || 0) > 0).length,
    [encuestadores]
  );
  const withoutSurveysCount = useMemo(
    () => encuestadores.filter((e) => (e.total_encuestas || 0) === 0).length,
    [encuestadores]
  );

  // Filtrado de encuestadores
  const filteredEncuestadores = useMemo(() => {
    return encuestadores.filter((item) => {
      // Filtro por pestaña
      if (filterTab === 'with_surveys' && (item.total_encuestas || 0) === 0) return false;
      if (filterTab === 'no_surveys' && (item.total_encuestas || 0) > 0) return false;

      // Filtro por texto
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = (item.nombre || '').toLowerCase().includes(q);
        const matchUser = (item.usuario || '').toLowerCase().includes(q);
        if (!matchName && !matchUser) return false;
      }

      return true;
    });
  }, [encuestadores, filterTab, searchTerm]);

  // Apertura de modal de edición
  const handleOpenEdit = (user: EncuestadorItem) => {
    setFormData({
      nombre: user.nombre,
      usuario: user.usuario,
      password: '',
    });
    setEditingId(user.id || null);
    setShowPassword(false);
    setShowModal(true);
  };

  // Apertura de modal de nuevo
  const handleOpenCreate = () => {
    setFormData({ nombre: '', usuario: '', password: '' });
    setEditingId(null);
    setShowPassword(false);
    setShowModal(true);
  };

  // Guardado (Creación o Actualización)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const newUser: User = {
      nombre: formData.nombre.trim(),
      usuario: formData.usuario.toLowerCase().trim(),
      password: formData.password || undefined,
      rol: 'encuestador',
    };

    try {
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        if (editingId) {
          const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores/${editingId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(newUser),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || 'Error al actualizar en el servidor');
          }
        } else {
          const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
            method: 'POST',
            headers,
            body: JSON.stringify(newUser),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || 'Error al crear en el servidor');
          }
        }
      }

      // Guardar / actualizar en SQLite local
      if (editingId) {
        await dbService.updateUsuario(editingId, newUser);
        toast.success('Encuestador actualizado con éxito.');
      } else {
        await dbService.addUsuario(newUser);
        toast.success('Nuevo encuestador creado con éxito.');
      }

      setShowModal(false);
      setEditingId(null);
      setFormData({ nombre: '', usuario: '', password: '' });
      loadEncuestadores();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error al guardar el encuestador. Verifica si el usuario ya existe.');
    } finally {
      setIsSaving(false);
    }
  };

  // Apertura de modal de eliminación protegida
  const handleOpenDeleteModal = async (encuestador: EncuestadorItem) => {
    setUserToDelete(encuestador);
    setAdminPassword('');
    setPasswordError('');
    setIsDeleting(false);

    try {
      if (encuestador.id) {
        const localSurveys = await dbService.getSurveysByEncuestador(
          encuestador.id,
          encuestador.usuario
        );
        const count = Math.max(encuestador.total_encuestas || 0, localSurveys.length);
        if (count > 0) {
          setRequiresPassword(true);
          setSurveysCount(count);
          return;
        }
      }
    } catch {
      // continuar
    }

    if ((encuestador.total_encuestas || 0) > 0) {
      setRequiresPassword(true);
      setSurveysCount(encuestador.total_encuestas || 0);
    } else {
      setRequiresPassword(false);
      setSurveysCount(0);
    }
  };

  // Confirmación de eliminación
  const handleConfirmDelete = async () => {
    if (!userToDelete?.id) return;
    setIsDeleting(true);
    setPasswordError('');

    try {
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores/${userToDelete.id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ adminPassword }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          if (data?.requiresPassword) {
            setRequiresPassword(true);
            setSurveysCount(data.totalEncuestas || 0);
            setPasswordError(
              data.error || 'Ingresa tu contraseña de administrador para confirmar la eliminación.'
            );
            setIsDeleting(false);
            return;
          }
          setPasswordError(data?.error || 'Error al eliminar el encuestador.');
          setIsDeleting(false);
          return;
        }
      }

      await dbService.deleteUsuario(userToDelete.id, userToDelete.usuario);
      toast.success(`Encuestador ${userToDelete.nombre} eliminado.`);
      setUserToDelete(null);
      setAdminPassword('');
      setPasswordError('');
      setRequiresPassword(false);
      loadEncuestadores();
    } catch (err: any) {
      console.error('Error al eliminar encuestador:', err);
      setPasswordError(err.message || 'Error al procesar la eliminación');
    } finally {
      setIsDeleting(false);
    }
  };

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
            onClick={() => navigate('/admin')}
            className="btn btn-icon btn-outline"
            title="Volver al panel principal"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>
                Gestión de Encuestadores
              </h1>
              {encuestadores.length > 0 && (
                <span
                  style={{
                    background: 'var(--primary)',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '999px',
                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
                  }}
                >
                  {encuestadores.length} {encuestadores.length === 1 ? 'operador' : 'operadores'}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
              Supervisión de rendimiento, credenciales y administración del personal de campo
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            disabled={reloading}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
            title="Recargar datos"
          >
            <RefreshCw size={16} className={reloading ? 'animate-spin' : ''} />
            <span>Recargar</span>
          </button>
          <Link
            to="/admin/encuestas"
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
          >
            <FileText size={16} />
            <span>Ver Encuestas Globales</span>
          </Link>
          <button
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}
          >
            <UserPlus size={18} />
            <span>Nuevo Encuestador</span>
          </button>
        </div>
      </header>

      {/* ── Tira de Métricas Ejecutivas (KPIs) ────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        {/* KPI 1: Total Encuestadores */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1 }}>
              {loading ? '...' : totalEncuestadores}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Total Encuestadores
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Personal registrado en el sistema
            </div>
          </div>
        </div>

        {/* KPI 2: Total Encuestas Levantadas */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ClipboardCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1, color: '#10b981' }}>
              {loading ? '...' : totalEncuestas}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Encuestas Levantadas
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Impacto acumulado por el equipo
            </div>
          </div>
        </div>

        {/* KPI 3: Personal Activo */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(14, 165, 233, 0.12)',
              color: '#0ea5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1 }}>
              {loading ? '...' : encuestadoresActivos}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Personal Activo
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              100% operativos para captura
            </div>
          </div>
        </div>

        {/* KPI 4: Promedio por Operador */}
        <div
          className="glass-container"
          style={{
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(168, 85, 247, 0.12)',
              color: '#a855f7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TrendingUp size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1 }}>
              {loading ? '...' : promedioPorEncuestador}
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Promedio por Operador
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Encuestas / encuestador
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra de Búsqueda y Filtros Rápidos ──────────────────────────────── */}
      <div
        className="glass-container"
        style={{
          marginBottom: '1.75rem',
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        {/* Input de Búsqueda */}
        <div
          style={{
            position: 'relative',
            flex: '1 1 280px',
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
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o usuario (@usuario)..."
            className="form-input"
            style={{
              paddingLeft: '2.6rem',
              paddingRight: searchTerm ? '2.5rem' : '1rem',
              width: '100%',
              margin: 0,
              borderRadius: '9999px',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
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

        {/* Pestañas de Filtrado */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'var(--surface-sunken, rgba(0,0,0,0.04))',
            padding: '0.3rem',
            borderRadius: '9999px',
            border: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setFilterTab('all')}
            style={{
              background: filterTab === 'all' ? 'var(--primary)' : 'transparent',
              color: filterTab === 'all' ? '#ffffff' : 'var(--text-muted)',
              border: 'none',
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: filterTab === 'all' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
            }}
          >
            Todos ({totalEncuestadores})
          </button>
          <button
            onClick={() => setFilterTab('with_surveys')}
            style={{
              background: filterTab === 'with_surveys' ? 'var(--primary)' : 'transparent',
              color: filterTab === 'with_surveys' ? '#ffffff' : 'var(--text-muted)',
              border: 'none',
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: filterTab === 'with_surveys' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
            }}
          >
            Con Encuestas ({withSurveysCount})
          </button>
          <button
            onClick={() => setFilterTab('no_surveys')}
            style={{
              background: filterTab === 'no_surveys' ? 'var(--primary)' : 'transparent',
              color: filterTab === 'no_surveys' ? '#ffffff' : 'var(--text-muted)',
              border: 'none',
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: filterTab === 'no_surveys' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none',
            }}
          >
            Sin Encuestas ({withoutSurveysCount})
          </button>
        </div>

        {/* Indicador de resultados */}
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          Mostrando <strong style={{ color: 'var(--text-main)' }}>{filteredEncuestadores.length}</strong> de{' '}
          {totalEncuestadores} encuestadores
        </div>
      </div>

      {/* ── Contenedor Principal: Grid de Encuestadores ──────────────────────── */}
      {loading ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto 1rem auto' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Cargando personal de campo...</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
            Sincronizando encuestadores locales y remotos
          </p>
        </div>
      ) : filteredEncuestadores.length === 0 ? (
        <div
          className="glass-container"
          style={{
            textAlign: 'center',
            padding: '3.5rem 2rem',
            border: '2px dashed var(--border)',
          }}
        >
          <Users size={44} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem auto', opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>
            {searchTerm ? 'No se encontraron encuestadores' : 'No hay personal registrado'}
          </h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem auto', fontSize: '0.9rem' }}>
            {searchTerm
              ? `No hay coincidencias para "${searchTerm}". Intenta con otro término o limpia los filtros.`
              : 'Comienza creando el primer encuestador para habilitar el levantamiento de encuestas en terreno.'}
          </p>
          {searchTerm ? (
            <button onClick={() => setSearchTerm('')} className="btn btn-outline">
              Limpiar búsqueda
            </button>
          ) : (
            <button onClick={handleOpenCreate} className="btn btn-primary">
              <UserPlus size={18} /> Registrar Primer Encuestador
            </button>
          )}
        </div>
      ) : (
        <div className="encuestadores-grid">
          {filteredEncuestadores.map((encuestador) => {
            const initial = encuestador.nombre ? encuestador.nombre.charAt(0).toUpperCase() : 'E';
            const count = encuestador.total_encuestas || 0;
            const creationDate = encuestador.creado_en
              ? new Date(encuestador.creado_en).toLocaleDateString()
              : null;

            return (
              <div key={encuestador.id} className="glass-container encuestador-card">
                {/* Cabecera de la tarjeta */}
                <div className="encuestador-card-header">
                  <div className="encuestador-avatar">{initial}</div>

                  <div className="encuestador-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <h3 className="encuestador-nombre" style={{ margin: 0 }}>
                        {encuestador.nombre}
                      </h3>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                        }}
                      >
                        <span
                          className="pulse-dot"
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#10b981',
                            display: 'inline-block',
                          }}
                        />
                        Activo
                      </span>
                    </div>

                    <div className="encuestador-user-tag" style={{ marginTop: '0.25rem' }}>
                      <span>@{encuestador.usuario}</span>
                      {creationDate && (
                        <>
                          <span style={{ opacity: 0.5 }}>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Calendar size={12} /> {creationDate}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Acciones superiores: Editar y Eliminar */}
                  <div className="encuestador-top-actions">
                    <button
                      onClick={() => handleOpenEdit(encuestador)}
                      className="btn btn-icon btn-outline"
                      title="Editar credenciales"
                      style={{ padding: '0.45rem', borderRadius: '50%' }}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleOpenDeleteModal(encuestador)}
                      className="btn btn-icon btn-outline"
                      style={{
                        color: '#ef4444',
                        borderColor: 'rgba(239, 68, 68, 0.35)',
                        padding: '0.45rem',
                        borderRadius: '50%',
                      }}
                      title="Eliminar del sistema"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Cuerpo de la tarjeta: Métricas rápidas */}
                <div
                  style={{
                    background: 'var(--surface-sunken, rgba(0,0,0,0.03))',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '12px',
                        background: count > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.12)',
                        color: count > 0 ? '#10b981' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ClipboardCheck size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Encuestas Registradas
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: count > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                        {count} {count === 1 ? 'encuesta' : 'encuestas'}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      padding: '0.35rem 0.85rem',
                      borderRadius: '9999px',
                      background: count > 0 ? 'rgba(79, 70, 229, 0.12)' : 'rgba(100, 116, 139, 0.08)',
                      color: count > 0 ? 'var(--primary)' : 'var(--text-muted)',
                      border: count > 0 ? '1px solid rgba(79, 70, 229, 0.25)' : '1px solid rgba(100, 116, 139, 0.15)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    {count > 0 ? 'Con actividad' : 'Sin datos'}
                  </span>
                </div>

                {/* Pie de la tarjeta: Botón para acceder al detalle */}
                <div className="encuestador-card-footer">
                  <Link
                    to={`/admin/encuestadores/${encuestador.id}`}
                    className="btn btn-primary"
                    style={{
                      padding: '0.7rem 1.15rem',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      fontWeight: 600,
                    }}
                  >
                    <span>Ver Encuestas ({count})</span>
                    <ChevronRight size={17} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Guía Rápida Operativa de Personal de Campo ───────────────────────── */}
      <div
        className="glass-container"
        style={{
          marginTop: '2.5rem',
          padding: '1.5rem',
          border: '1px solid rgba(99, 102, 241, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
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
              Panel de Control y Operaciones de Campo
            </h3>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.82rem' }}>
              Lineamientos clave para la administración del equipo y resguardo de datos
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
          {/* Tarjeta Informativa 1 */}
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <CheckCircle2 size={17} style={{ color: '#10b981' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                Modo Offline Autónomo
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Cada encuestador tiene asignada una base de datos local SQLite. Puede ingresar y consultar encuestas sin internet; al conectarse se sincronizan automáticamente con el servidor central.
            </p>
          </div>

          {/* Tarjeta Informativa 2 */}
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <FileText size={17} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                Auditoría y Reportes Excel
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Al hacer clic en <em>"Ver Encuestas"</em> podrás filtrar por rango de fecha, turno u hora exacta de levantamiento, y generar reportes oficiales en formato Excel (.xlsx).
            </p>
          </div>

          {/* Tarjeta Informativa 3 */}
          <div
            style={{
              background: 'var(--surface-sunken, rgba(0,0,0,0.02))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={17} style={{ color: '#0ea5e9' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>
                Eliminación Protegida
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Si un encuestador tiene formularios asociados, el sistema exige confirmación mediante contraseña de administrador para prevenir la pérdida accidental de datos de campo.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal Flotante: Crear / Editar Encuestador ───────────────────────── */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSaving) setShowModal(false);
          }}
        >
          <div
            className="glass-container"
            style={{
              maxWidth: '520px',
              width: '100%',
              borderRadius: '24px',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              padding: '1.75rem',
            }}
          >
            {/* Cabecera del modal */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {editingId ? <Edit2 size={18} /> : <UserPlus size={18} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                    {editingId ? 'Editar Encuestador' : 'Nuevo Encuestador'}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {editingId
                      ? 'Actualiza las credenciales y datos de acceso'
                      : 'Habilita un nuevo operador para recolección de campo'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => !isSaving && setShowModal(false)}
                className="btn btn-icon"
                style={{ background: 'transparent', borderRadius: '50%' }}
                title="Cerrar"
                disabled={isSaving}
              >
                <X size={20} />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Campo Nombre Completo */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserIcon size={15} style={{ color: 'var(--primary)' }} />
                  <span>Nombre Completo *</span>
                </label>
                <input
                  required
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej. Oscar Gómez Pérez"
                  className="form-input"
                  style={{ width: '100%', margin: 0, borderRadius: '12px' }}
                  disabled={isSaving}
                />
              </div>

              {/* Campo Usuario */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>@</span>
                  <span>Nombre de Usuario (Para Login) *</span>
                </label>
                <input
                  required
                  type="text"
                  value={formData.usuario}
                  onChange={(e) => setFormData({ ...formData, usuario: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                  placeholder="ej. oscar_perez"
                  className="form-input"
                  style={{ width: '100%', margin: 0, borderRadius: '12px' }}
                  disabled={isSaving}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                  Identificador único que usará en la pantalla de inicio de sesión de la APK.
                </span>
              </div>

              {/* Campo Contraseña */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Lock size={15} style={{ color: 'var(--primary)' }} />
                  <span>
                    Contraseña {editingId ? '(Opcional si deseas conservarla)' : '*'}
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    required={!editingId}
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingId ? 'Dejar en blanco para mantener la actual' : 'Mínimo 6 caracteres'}
                    className="form-input"
                    style={{ width: '100%', paddingRight: '2.5rem', margin: 0, borderRadius: '12px' }}
                    disabled={isSaving}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '50%',
                    }}
                    title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Botones de acción */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-outline"
                  style={{ borderRadius: '12px' }}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px' }}
                >
                  <Save size={18} />
                  <span>{isSaving ? 'Guardando...' : editingId ? 'Actualizar Encuestador' : 'Crear Encuestador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmación Estilizado para Eliminación Segura ─────────── */}
      <ConfirmModal
        isOpen={!!userToDelete}
        title="Eliminar Encuestador"
        message={
          <>
            ¿Estás seguro de que deseas eliminar al encuestador{' '}
            <strong style={{ color: 'var(--text-main)' }}>{userToDelete?.nombre}</strong> (
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>@{userToDelete?.usuario}</span>)?
            {surveysCount > 0 ? (
              <div
                style={{
                  marginTop: '0.85rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
              >
                ⚠️ <strong>Advertencia Crítica:</strong> Este encuestador tiene{' '}
                <strong>{surveysCount}</strong> {surveysCount === 1 ? 'encuesta registrada' : 'encuestas registradas'}. Al eliminarlo,{' '}
                <strong>también se eliminarán definitivamente todas sus encuestas asociadas</strong> del sistema.
              </div>
            ) : (
              <span style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: '0.5rem', display: 'block' }}>
                Esta acción eliminará al encuestador del sistema y revocará su acceso a la APK móvil.
              </span>
            )}
          </>
        }
        confirmText="Sí, eliminar definitivamente"
        cancelText="Cancelar"
        isDanger={true}
        isLoading={isDeleting}
        requiresPassword={requiresPassword}
        passwordValue={adminPassword}
        onPasswordChange={(val) => {
          setAdminPassword(val);
          setPasswordError('');
        }}
        errorMessage={passwordError}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) {
            setUserToDelete(null);
            setAdminPassword('');
            setPasswordError('');
            setRequiresPassword(false);
          }
        }}
      />
    </div>
  );
}
