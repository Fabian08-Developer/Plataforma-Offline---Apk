import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { BACKEND_URL } from '../../config';
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Trash2,
  Phone,
  MapPin,
  Briefcase,
  ShieldCheck,
  X,
  Info,
  Search,
  Check,
} from 'lucide-react';
import { normalizeText, levenshtein } from '../../services/similarityUtils';
import { dbService } from '../../db';

interface SurveyRecord {
  id: number;
  tipo_documento: string;
  documento_identidad: string;
  nombres: string;
  apellidos: string;
  telefono_1: string;
  telefono_2?: string;
  telefono_3?: string;
  direccion: string;
  profesion?: string;
  fecha_registro: string;
  hora_registro?: string;
  sincronizado_en?: string;
  encuestador?: {
    id: number;
    nombre: string;
    usuario: string;
  };
}

interface DuplicateCase {
  id: string;
  surveyA: SurveyRecord;
  surveyB: SurveyRecord;
  motivo: string;
  nivel: 'high' | 'medium';
}

export default function AdminDuplicados() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();

  const [casos, setCasos] = useState<DuplicateCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filtros de búsqueda en la bandeja
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'high' | 'medium'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal para fusionar
  const [mergeCase, setMergeCase] = useState<DuplicateCase | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [selectedName, setSelectedName] = useState<'A' | 'B'>('A');
  const [selectedAddress, setSelectedAddress] = useState<'A' | 'B'>('A');

  // Modal para eliminar una
  const [deleteModal, setDeleteModal] = useState<{
    caseId: string;
    surveyA: SurveyRecord;
    surveyB: SurveyRecord;
  } | null>(null);

  const loadDuplicados = async () => {
    try {
      const authToken = token || localStorage.getItem('auth_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/duplicados`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data: DuplicateCase[] = await res.json();
        setCasos(data);
      } else {
        toast.error('No se pudo cargar la lista de duplicados');
      }
    } catch (error) {
      console.error('Error cargando duplicados:', error);
      toast.error('Error de conexión al consultar duplicados');
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    loadDuplicados();
  }, [token]);

  const handleRefresh = async () => {
    setReloading(true);
    await loadDuplicados();
    toast.success('Bandeja de duplicados actualizada');
  };

  // Filtrado de casos en memoria
  const filteredCasos = useMemo(() => {
    return casos.filter((caso) => {
      // Filtro de severidad
      if (filterSeverity !== 'all' && caso.nivel !== filterSeverity) return false;

      // Filtro de búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const docA = (caso.surveyA.documento_identidad || '').toLowerCase();
        const docB = (caso.surveyB.documento_identidad || '').toLowerCase();
        const nameA = `${caso.surveyA.nombres} ${caso.surveyA.apellidos}`.toLowerCase();
        const nameB = `${caso.surveyB.nombres} ${caso.surveyB.apellidos}`.toLowerCase();
        const encA = (caso.surveyA.encuestador?.nombre || '').toLowerCase();
        const encB = (caso.surveyB.encuestador?.nombre || '').toLowerCase();

        return (
          docA.includes(term) ||
          docB.includes(term) ||
          nameA.includes(term) ||
          nameB.includes(term) ||
          encA.includes(term) ||
          encB.includes(term)
        );
      }

      return true;
    });
  }, [casos, filterSeverity, searchTerm]);

  // Conteo por severidad
  const highCount = useMemo(() => casos.filter((c) => c.nivel === 'high').length, [casos]);
  const mediumCount = useMemo(() => casos.filter((c) => c.nivel === 'medium').length, [casos]);

  // ── 1. Acción: Aprobar ambas (Son personas distintas) ───────────────────────
  const handleAprobar = async (caso: DuplicateCase) => {
    setProcessingId(caso.id);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/duplicados/aprobar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          surveyAId: caso.surveyA.id,
          surveyBId: caso.surveyB.id,
        }),
      });

      if (res.ok) {
        toast.success('Caso aprobado: Se validaron ambas encuestas como legítimas');
        setCasos((prev) => prev.filter((c) => c.id !== caso.id));
      } else {
        toast.error('Error al aprobar el caso');
      }
    } catch (err) {
      console.error('Error aprobando caso:', err);
      toast.error('Error de conexión al aprobar el caso');
    } finally {
      setProcessingId(null);
    }
  };

  // ── 2. Preparar Fusión ──────────────────────────────────────────────────────
  const openMergeModal = (caso: DuplicateCase) => {
    setMergeCase(caso);
    setSelectedDocId(caso.surveyA.documento_identidad);
    setSelectedName('A');
    setSelectedAddress('A');
  };

  const handleConfirmMerge = async () => {
    if (!mergeCase) return;
    setProcessingId(mergeCase.id);

    try {
      const authToken = token || localStorage.getItem('auth_token');
      const targetSurvey = mergeCase.surveyA;
      const sourceSurvey = mergeCase.surveyB;

      const chosenName = selectedName === 'A' ? targetSurvey : sourceSurvey;
      const chosenAddress = selectedAddress === 'A' ? targetSurvey : sourceSurvey;

      const datosFusionados = {
        documento_identidad: selectedDocId,
        tipo_documento:
          selectedDocId === targetSurvey.documento_identidad
            ? targetSurvey.tipo_documento
            : sourceSurvey.tipo_documento,
        nombres: chosenName.nombres,
        apellidos: chosenName.apellidos,
        direccion: chosenAddress.direccion,
        profesion: chosenName.profesion || chosenAddress.profesion,
        telefono_1: targetSurvey.telefono_1 || sourceSurvey.telefono_1,
      };

      const res = await fetch(`${BACKEND_URL}/api/admin/duplicados/fusionar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          targetId: targetSurvey.id,
          sourceId: sourceSurvey.id,
          datosFusionados,
        }),
      });

      if (res.ok) {
        if (sourceSurvey.documento_identidad) {
          await dbService.deleteSurveyByDocumento(sourceSurvey.documento_identidad).catch(() => {});
        }
        await dbService.deleteSurvey(sourceSurvey.id).catch(() => {});
        window.dispatchEvent(new Event('surveys-updated'));

        toast.success('Encuestas fusionadas con éxito en un solo registro limpio');
        setCasos((prev) => prev.filter((c) => c.id !== mergeCase.id));
        setMergeCase(null);
      } else {
        toast.error('Error al fusionar las encuestas');
      }
    } catch (err) {
      console.error('Error fusionando encuestas:', err);
      toast.error('Error de conexión al fusionar');
    } finally {
      setProcessingId(null);
    }
  };

  // ── 3. Acción: Eliminar una de las encuestas ─────────────────────────────────
  const handleDeleteSurvey = async (surveyIdToDelete: number, otherSurveyId: number, caseId: string) => {
    setProcessingId(caseId);
    try {
      const authToken = token || localStorage.getItem('auth_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/duplicados/eliminar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          surveyIdToDelete,
          otherSurveyId,
        }),
      });

      if (res.ok) {
        const toDeleteRecord = deleteModal?.surveyA?.id === surveyIdToDelete 
          ? deleteModal.surveyA 
          : deleteModal?.surveyB?.id === surveyIdToDelete 
            ? deleteModal.surveyB 
            : null;
        if (toDeleteRecord?.documento_identidad) {
          await dbService.deleteSurveyByDocumento(toDeleteRecord.documento_identidad).catch(() => {});
        }
        await dbService.deleteSurvey(surveyIdToDelete).catch(() => {});
        window.dispatchEvent(new Event('surveys-updated'));

        toast.success(`Encuesta #${surveyIdToDelete} descartada y eliminada`);
        setCasos((prev) => prev.filter((c) => c.id !== caseId));
        setDeleteModal(null);
      } else {
        toast.error('Error al eliminar la encuesta');
      }
    } catch (err) {
      console.error('Error eliminando encuesta:', err);
      toast.error('Error de conexión al eliminar');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      {/* ── Encabezado Principal ────────────────────────────────────────────── */}
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
                Bandeja de Duplicados
              </h1>
              {casos.length > 0 && (
                <span
                  style={{
                    background: '#ef4444',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '999px',
                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                  }}
                >
                  {casos.length} {casos.length === 1 ? 'caso' : 'casos'}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0 0', fontSize: '0.9rem' }}>
              Auditoría y resolución inteligente de registros similares o en conflicto
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleRefresh}
            disabled={reloading}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
          >
            <RefreshCw size={16} className={reloading ? 'animate-spin' : ''} />
            <span>Recargar</span>
          </button>
          <Link
            to="/admin/encuestas"
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
          >
            Ver Todas las Encuestas
          </Link>
        </div>
      </header>

      {/* ── Barra de Métricas y Filtros Rápidos (Resumen Ejecutivo) ─────────── */}
      {!loading && casos.length > 0 && (
        <div
          className="glass-container"
          style={{
            marginBottom: '1.75rem',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Fila de Métricas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: 'var(--background)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(79, 70, 229, 0.12)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                  Total en Revisión
                </span>
                <strong style={{ fontSize: '1.25rem' }}>{casos.length}</strong>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: 'var(--background)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: highCount > 0 ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                  Alta Sospecha (Cédula)
                </span>
                <strong style={{ fontSize: '1.25rem', color: highCount > 0 ? '#ef4444' : 'var(--text-main)' }}>
                  {highCount}
                </strong>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: 'var(--background)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Info size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                  Revisión Moderada (Nombres)
                </span>
                <strong style={{ fontSize: '1.25rem', color: '#d97706' }}>{mediumCount}</strong>
              </div>
            </div>
          </div>

          {/* Fila de Filtros y Búsqueda */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              borderTop: '1px solid rgba(226, 232, 240, 0.1)',
              paddingTop: '0.75rem',
            }}
          >
            {/* Píldoras de Severidad */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: '0.2rem' }}>
                Filtrar:
              </span>
              <button
                onClick={() => setFilterSeverity('all')}
                className={`btn btn-sm ${filterSeverity === 'all' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem', borderRadius: '20px' }}
              >
                Todos ({casos.length})
              </button>
              <button
                onClick={() => setFilterSeverity('high')}
                className={`btn btn-sm ${filterSeverity === 'high' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem', borderRadius: '20px' }}
              >
                Alta sospecha ({highCount})
              </button>
              <button
                onClick={() => setFilterSeverity('medium')}
                className={`btn btn-sm ${filterSeverity === 'medium' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem', borderRadius: '20px' }}
              >
                Moderada ({mediumCount})
              </button>
            </div>

            {/* Input de Búsqueda rápida */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '240px', flex: 1, maxWidth: '360px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por cédula o nombre..."
                className="form-input"
                style={{ paddingLeft: '2.4rem', paddingRight: searchTerm ? '2.2rem' : '0.75rem', fontSize: '0.85rem', paddingBlock: '0.4rem' }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{ position: 'absolute', right: '0.6rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Estado de Carga ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div className="animate-spin" style={{ display: 'inline-block', marginBottom: '1rem' }}>
            <RefreshCw size={36} color="var(--primary)" />
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Analizando base de datos en busca de posibles duplicados...</p>
        </div>
      ) : casos.length === 0 ? (
        /* ── Estado Vacío (Sin Duplicados) ─────────────────────────────────── */
        <div className="glass-container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1.25rem',
              background: 'rgba(16, 185, 129, 0.12)',
              borderRadius: '50%',
              marginBottom: '1.25rem',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <ShieldCheck size={52} color="#10b981" />
          </div>
          <h2 style={{ fontSize: '1.4rem', margin: '0 0 0.5rem' }}>¡Excelente! No hay duplicados pendientes</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto 2rem', fontSize: '0.95rem' }}>
            Todas las encuestas en la base de datos cuentan con documentos y nombres únicos, o los casos anteriores ya
            fueron revisados y resueltos.
          </p>
          <Link to="/admin/encuestas" className="btn btn-primary">
            Ir al Gestor de Encuestas
          </Link>
        </div>
      ) : filteredCasos.length === 0 ? (
        /* ── Sin Coincidencias de Filtro ───────────────────────────────────── */
        <div className="glass-container" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Search size={36} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <h3>No se encontraron casos</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No hay casos en conflicto que coincidan con los filtros aplicados.
          </p>
          <button
            onClick={() => {
              setFilterSeverity('all');
              setSearchTerm('');
            }}
            className="btn btn-outline"
            style={{ marginTop: '0.5rem' }}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        /* ── Lista de Casos en Conflicto ───────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {filteredCasos.map((caso, index) => {
            const docA = (caso.surveyA.documento_identidad || '').trim();
            const docB = (caso.surveyB.documento_identidad || '').trim();
            const isDocEqual = docA === docB;
            const docDist = isDocEqual ? 0 : levenshtein(docA, docB);

            const nameA = normalizeText(`${caso.surveyA.nombres} ${caso.surveyA.apellidos}`);
            const nameB = normalizeText(`${caso.surveyB.nombres} ${caso.surveyB.apellidos}`);
            const isNameEqual = nameA === nameB;

            const phoneA = (caso.surveyA.telefono_1 || '').trim();
            const phoneB = (caso.surveyB.telefono_1 || '').trim();
            const isPhoneEqual = phoneA && phoneB && phoneA === phoneB;

            const dirA = (caso.surveyA.direccion || '').trim().toLowerCase();
            const dirB = (caso.surveyB.direccion || '').trim().toLowerCase();
            const isDirEqual = dirA && dirB && dirA === dirB;

            return (
              <div
                key={caso.id}
                className="glass-container"
                style={{
                  padding: '1.5rem',
                  border: `1px solid ${caso.nivel === 'high' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Franja superior de severidad */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: caso.nivel === 'high' ? 'linear-gradient(90deg, #ef4444, #f59e0b)' : '#f59e0b',
                  }}
                />

                {/* Encabezado del caso */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        padding: '0.55rem',
                        borderRadius: '0.65rem',
                        background: caso.nivel === 'high' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: caso.nivel === 'high' ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      <AlertTriangle size={22} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                          Caso #{index + 1}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.55rem',
                            borderRadius: '999px',
                            background: caso.nivel === 'high' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: caso.nivel === 'high' ? '#ef4444' : '#d97706',
                            border: `1px solid ${caso.nivel === 'high' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                          }}
                        >
                          {caso.nivel === 'high' ? 'Alta sospecha' : 'Revisión recomendada'}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: '0.2rem 0 0 0',
                          fontSize: '0.88rem',
                          color: caso.nivel === 'high' ? '#ef4444' : 'var(--text-muted)',
                          fontWeight: 500,
                        }}
                      >
                        {caso.motivo}
                      </p>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Conflicto: Encuestas <strong>#{caso.surveyA.id}</strong> y <strong>#{caso.surveyB.id}</strong>
                  </span>
                </div>

                {/* ── Barra de Diagnóstico de Similitud (Chips explicativos) ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    background: 'var(--background)',
                    padding: '0.65rem 0.9rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    marginBottom: '1.25rem',
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Diagnóstico:</span>

                  {/* Diagnóstico Cédula */}
                  {isDocEqual ? (
                    <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <AlertTriangle size={12} /> Cédula idéntica ({docA})
                    </span>
                  ) : docDist <= 2 ? (
                    <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <AlertTriangle size={12} /> Cédula difiere en {docDist} dígito{docDist > 1 ? 's' : ''}
                    </span>
                  ) : null}

                  {/* Diagnóstico Nombre */}
                  {isNameEqual ? (
                    <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={12} /> Mismo nombre completo
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Info size={12} /> Nombres similares
                    </span>
                  )}

                  {/* Diagnóstico Teléfono */}
                  {isPhoneEqual && (
                    <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={12} /> Teléfono 1 idéntico ({phoneA})
                    </span>
                  )}

                  {/* Diagnóstico Dirección */}
                  {isDirEqual && (
                    <span style={{ color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={12} /> Misma dirección
                    </span>
                  )}
                </div>

                {/* ── Comparativa Lado a Lado (Responsive) ── */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1.25rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  {/* Registro A */}
                  <div
                    style={{
                      background: 'var(--background)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(79, 70, 229, 0.3)',
                      padding: '1.2rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.85rem',
                        borderBottom: '1px solid var(--border)',
                        paddingBottom: '0.5rem',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>
                        Registro A (ID #{caso.surveyA.id})
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {caso.surveyA.fecha_registro}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.88rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block' }}>
                          Documento de Identidad:
                        </span>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '1rem',
                            color: !isDocEqual ? '#ef4444' : 'var(--text-main)',
                            background: !isDocEqual ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            padding: !isDocEqual ? '0.2rem 0.4rem' : '0',
                            borderRadius: '0.25rem',
                            display: 'inline-block',
                          }}
                        >
                          {caso.surveyA.tipo_documento}: {caso.surveyA.documento_identidad}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block' }}>
                          Nombre Completo:
                        </span>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {caso.surveyA.nombres} {caso.surveyA.apellidos}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', color: 'var(--text-muted)' }}>
                        <Phone size={15} style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div>
                          <span>
                            Tel 1: <strong>{caso.surveyA.telefono_1 || 'No registrado'}</strong>
                          </span>
                          {caso.surveyA.telefono_2 && (
                            <span style={{ display: 'block', fontSize: '0.8rem' }}>
                              Tel 2: {caso.surveyA.telefono_2}
                            </span>
                          )}
                          {caso.surveyA.telefono_3 && (
                            <span style={{ display: 'block', fontSize: '0.8rem' }}>
                              Tel 3: {caso.surveyA.telefono_3}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)' }}>
                        <MapPin size={15} style={{ flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {caso.surveyA.direccion || 'Sin dirección registrada'}
                        </span>
                      </div>

                      {caso.surveyA.profesion && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)' }}>
                          <Briefcase size={15} style={{ flexShrink: 0 }} />
                          <span>{caso.surveyA.profesion}</span>
                        </div>
                      )}

                      <div
                        style={{
                          borderTop: '1px dashed var(--border)',
                          paddingTop: '0.5rem',
                          marginTop: '0.35rem',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Encuestador: <strong>{caso.surveyA.encuestador?.nombre || 'Central'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Registro B */}
                  <div
                    style={{
                      background: 'var(--background)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      padding: '1.2rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.85rem',
                        borderBottom: '1px solid var(--border)',
                        paddingBottom: '0.5rem',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: '#d97706', fontSize: '0.95rem' }}>
                        Registro B (ID #{caso.surveyB.id})
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {caso.surveyB.fecha_registro}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.88rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block' }}>
                          Documento de Identidad:
                        </span>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '1rem',
                            color: !isDocEqual ? '#ef4444' : 'var(--text-main)',
                            background: !isDocEqual ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            padding: !isDocEqual ? '0.2rem 0.4rem' : '0',
                            borderRadius: '0.25rem',
                            display: 'inline-block',
                          }}
                        >
                          {caso.surveyB.tipo_documento}: {caso.surveyB.documento_identidad}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block' }}>
                          Nombre Completo:
                        </span>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {caso.surveyB.nombres} {caso.surveyB.apellidos}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', color: 'var(--text-muted)' }}>
                        <Phone size={15} style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div>
                          <span>
                            Tel 1: <strong>{caso.surveyB.telefono_1 || 'No registrado'}</strong>
                          </span>
                          {caso.surveyB.telefono_2 && (
                            <span style={{ display: 'block', fontSize: '0.8rem' }}>
                              Tel 2: {caso.surveyB.telefono_2}
                            </span>
                          )}
                          {caso.surveyB.telefono_3 && (
                            <span style={{ display: 'block', fontSize: '0.8rem' }}>
                              Tel 3: {caso.surveyB.telefono_3}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)' }}>
                        <MapPin size={15} style={{ flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {caso.surveyB.direccion || 'Sin dirección registrada'}
                        </span>
                      </div>

                      {caso.surveyB.profesion && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-muted)' }}>
                          <Briefcase size={15} style={{ flexShrink: 0 }} />
                          <span>{caso.surveyB.profesion}</span>
                        </div>
                      )}

                      <div
                        style={{
                          borderTop: '1px dashed var(--border)',
                          paddingTop: '0.5rem',
                          marginTop: '0.35rem',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Encuestador: <strong>{caso.surveyB.encuestador?.nombre || 'Central'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Barra de Acciones del Caso (Responsive Desktop & Mobile) ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '1rem',
                  }}
                >
                  {/* Botón 1: Aprobar ambas */}
                  <button
                    onClick={() => handleAprobar(caso)}
                    disabled={processingId === caso.id}
                    className="btn btn-outline"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      borderColor: 'rgba(16, 185, 129, 0.5)',
                      color: '#10b981',
                      fontSize: '0.88rem',
                    }}
                    title="Conservar ambas encuestas como personas distintas"
                  >
                    <CheckCircle2 size={16} /> Aprobar ambas (Personas distintas)
                  </button>

                  {/* Botón 2: Fusionar */}
                  <button
                    onClick={() => openMergeModal(caso)}
                    disabled={processingId === caso.id}
                    className="btn btn-primary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      fontSize: '0.88rem',
                    }}
                    title="Unir teléfonos e información en una sola encuesta limpia"
                  >
                    <GitMerge size={16} /> Fusionar en una sola
                  </button>

                  {/* Botón 3: Eliminar una */}
                  <button
                    onClick={() =>
                      setDeleteModal({ caseId: caso.id, surveyA: caso.surveyA, surveyB: caso.surveyB })
                    }
                    disabled={processingId === caso.id}
                    className="btn btn-outline"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      fontSize: '0.88rem',
                    }}
                    title="Descartar una encuesta duplicada"
                  >
                    <Trash2 size={16} /> Eliminar una...
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL DE FUSIÓN DE ENCUESTAS (Completamente Adaptativo) ─────────── */}
      {mergeCase && (
        <div className="similarity-modal-overlay" style={{ padding: '1rem' }}>
          <div className="similarity-modal-card" style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="similarity-top-stripe" style={{ background: 'linear-gradient(90deg, #4f46e5, #10b981)' }} />
            <div className="similarity-modal-body" style={{ padding: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                      flexShrink: 0,
                    }}
                  >
                    <GitMerge size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
                      Fusionar Encuestas en Conflicto
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Selecciona qué datos conservar. Los números de teléfono se combinarán automáticamente.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMergeCase(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Selector de Cédula Correcta */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">¿Cuál es el número de documento correcto? *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${
                        selectedDocId === mergeCase.surveyA.documento_identidad
                          ? 'var(--primary)'
                          : 'var(--border)'
                      }`,
                      background:
                        selectedDocId === mergeCase.surveyA.documento_identidad
                          ? 'rgba(79, 70, 229, 0.06)'
                          : 'var(--background)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="mergeDoc"
                      checked={selectedDocId === mergeCase.surveyA.documento_identidad}
                      onChange={() => setSelectedDocId(mergeCase.surveyA.documento_identidad)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem' }}>
                        {mergeCase.surveyA.tipo_documento}: {mergeCase.surveyA.documento_identidad}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Encuesta #{mergeCase.surveyA.id} ({mergeCase.surveyA.fecha_registro})
                      </span>
                    </div>
                  </label>

                  {mergeCase.surveyA.documento_identidad !== mergeCase.surveyB.documento_identidad && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${
                          selectedDocId === mergeCase.surveyB.documento_identidad
                            ? 'var(--primary)'
                            : 'var(--border)'
                        }`,
                        background:
                          selectedDocId === mergeCase.surveyB.documento_identidad
                            ? 'rgba(79, 70, 229, 0.06)'
                            : 'var(--background)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        name="mergeDoc"
                        checked={selectedDocId === mergeCase.surveyB.documento_identidad}
                        onChange={() => setSelectedDocId(mergeCase.surveyB.documento_identidad)}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.95rem' }}>
                          {mergeCase.surveyB.tipo_documento}: {mergeCase.surveyB.documento_identidad}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Encuesta #{mergeCase.surveyB.id} ({mergeCase.surveyB.fecha_registro})
                        </span>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Selector de Nombre */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">¿Qué nombre completo conservar? *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedName('A')}
                    className={`btn ${selectedName === 'A' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: '0.85rem', padding: '0.6rem' }}
                  >
                    {mergeCase.surveyA.nombres} {mergeCase.surveyA.apellidos}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedName('B')}
                    className={`btn ${selectedName === 'B' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: '0.85rem', padding: '0.6rem' }}
                  >
                    {mergeCase.surveyB.nombres} {mergeCase.surveyB.apellidos}
                  </button>
                </div>
              </div>

              {/* Selector de Dirección si difieren */}
              {mergeCase.surveyA.direccion !== mergeCase.surveyB.direccion && (
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">¿Qué dirección conservar? *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedAddress('A')}
                      className={`btn ${selectedAddress === 'A' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.8rem', padding: '0.5rem', whiteSpace: 'normal', height: 'auto' }}
                    >
                      {mergeCase.surveyA.direccion || 'Dirección A'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAddress('B')}
                      className={`btn ${selectedAddress === 'B' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.8rem', padding: '0.5rem', whiteSpace: 'normal', height: 'auto' }}
                    >
                      {mergeCase.surveyB.direccion || 'Dirección B'}
                    </button>
                  </div>
                </div>
              )}

              {/* Resumen de Teléfonos Fusionados */}
              <div
                style={{
                  background: 'var(--background)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  marginBottom: '1.5rem',
                  fontSize: '0.82rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    marginBottom: '0.4rem',
                  }}
                >
                  <Info size={15} color="var(--primary)" />
                  <span>Teléfonos combinados automáticamente (Regla MRU):</span>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {[
                    mergeCase.surveyA.telefono_1,
                    mergeCase.surveyA.telefono_2,
                    mergeCase.surveyA.telefono_3,
                    mergeCase.surveyB.telefono_1,
                    mergeCase.surveyB.telefono_2,
                    mergeCase.surveyB.telefono_3,
                  ]
                    .filter(Boolean)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 3)
                    .map((tel, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'rgba(79, 70, 229, 0.08)',
                          color: 'var(--primary)',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontWeight: 600,
                        }}
                      >
                        Tel {i + 1}: {tel}
                      </span>
                    ))}
                </div>
              </div>

              {/* Botones de acción del Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setMergeCase(null)}
                  className="btn btn-outline"
                  style={{ flex: '1 1 120px' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMerge}
                  className="btn btn-primary"
                  style={{ flex: '2 1 180px' }}
                >
                  Confirmar Fusión
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PARA ELIMINAR UNA ENCUESTA EN CONFLICTO ──────────────────── */}
      {deleteModal && (
        <div className="similarity-modal-overlay" style={{ padding: '1rem' }}>
          <div className="similarity-modal-card" style={{ maxWidth: '500px' }}>
            <div className="similarity-top-stripe" style={{ background: '#ef4444' }} />
            <div className="similarity-modal-body" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>¿Cuál encuesta deseas eliminar?</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    La encuesta seleccionada se borrará permanentemente de la base de datos central y local.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.9rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Encuesta #{deleteModal.surveyA.id}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Doc: {deleteModal.surveyA.documento_identidad} — {deleteModal.surveyA.nombres}{' '}
                      {deleteModal.surveyA.apellidos}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleDeleteSurvey(deleteModal.surveyA.id, deleteModal.surveyB.id, deleteModal.caseId)
                    }
                    className="btn btn-outline"
                    style={{
                      borderColor: 'rgba(239,68,68,0.4)',
                      color: '#ef4444',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    Borrar esta
                  </button>
                </div>

                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.9rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>Encuesta #{deleteModal.surveyB.id}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Doc: {deleteModal.surveyB.documento_identidad} — {deleteModal.surveyB.nombres}{' '}
                      {deleteModal.surveyB.apellidos}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleDeleteSurvey(deleteModal.surveyB.id, deleteModal.surveyA.id, deleteModal.caseId)
                    }
                    className="btn btn-outline"
                    style={{
                      borderColor: 'rgba(239,68,68,0.4)',
                      color: '#ef4444',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    Borrar esta
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setDeleteModal(null)} className="btn btn-outline">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
