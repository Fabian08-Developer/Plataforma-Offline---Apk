import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dbService, type Survey } from '../db';
import { updatePhonesList } from '../services/phoneLogic';
import { checkSimilarity, type SimilarityMatch } from '../services/similarityUtils';
import { ArrowLeft, Save, Loader2, Info, AlertTriangle, X, Edit3, ArrowRight } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import { isPossiblePhoneNumber, validatePhoneNumberLength } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BACKEND_URL } from '../config';
import { reconciliarEncuestasEliminadas } from '../services/reconciliation';

/** Mensajes para cédulas de otro encuestador: nunca se muestran nombres ni datos de esa persona */
const MENSAJE_CEDULA_AJENA = 'Esta cédula ya está registrada por otro encuestador. Consulte al administrador.';
const MENSAJE_SIMILAR_AJENO = 'Posible duplicado con un registro de otro encuestador. Consulte al administrador.';


/**
 * Verifica si un número de teléfono supera la longitud máxima permitida.
 * Usa dos capas:
 *   1. validatePhoneNumberLength() de libphonenumber-js (respeta el país)
 *   2. Límite absoluto de 15 dígitos según el estándar E.164 internacional
 * Esto cubre tanto el typing normal como el pegado (paste) de strings largas.
 */
function isPhoneTooLong(val: string): boolean {
  try {
    const status = validatePhoneNumberLength(val);
    if (status === 'TOO_LONG') return true;
  } catch {
    // continúa con el fallback de dígitos
  }
  // Fallback: contar solo dígitos — E.164 permite máx 15 en total
  const digits = val.replace(/\D/g, '');
  return digits.length > 15;
}


export default function SurveyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Survey>>({
    tipo_documento: 'C.C',
    documento_identidad: '',
    nombres: '',
    apellidos: '',
    telefono_1: '',
    telefono_2: '',
    telefono_3: '',
    direccion: '',
    fecha_registro: new Date().toISOString().split('T')[0],
    hora_registro: new Date().toTimeString().slice(0, 5),
    creado_en: new Date().toISOString(),
    profesion: '',
    estado_sincronizacion: 'pendiente'
  });

  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [existingFound, setExistingFound] = useState(false);
  const [conflictSurvey, setConflictSurvey] = useState<Survey | null>(null);
  /** true cuando la cédula pertenece a otro encuestador: no se muestra ningún dato de esa persona */
  const [conflictoAjeno, setConflictoAjeno] = useState(false);
  /** Solo se usan datos de encuestas propias (o de todas si es admin). Las copias de otros no se muestran. */
  const esPropiaLocal = (s: { encuestador_usuario?: string }): boolean =>
    user?.rol === 'admin' || (!!s.encuestador_usuario && s.encuestador_usuario === user?.usuario);
  const [originalDoc, setOriginalDoc] = useState<string>('');
  const [phoneError, setPhoneError] = useState('');
  // Estado para advertencias de posibles duplicados
  const [similarityWarnings, setSimilarityWarnings] = useState<SimilarityMatch[]>([]);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);
  const [checkingSimilarity, setCheckingSimilarity] = useState(false);

  useEffect(() => {
    async function loadSurvey() {
      if (isEditing) {
        // 1. Si es administrador (o tiene token) y hay red, cargar del servidor centralizado
        //    ya que los IDs mostrados en el panel de administración provienen de PostgreSQL.
        if (user?.rol === 'admin') {
          try {
            const authToken = token || localStorage.getItem('auth_token');
            const res = await fetch(`${BACKEND_URL}/api/admin/encuestas/${id}`, {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const remoteSurvey = await res.json();
              if (remoteSurvey && remoteSurvey.documento_identidad) {
                setFormData(remoteSurvey);
                setOriginalDoc(remoteSurvey.documento_identidad);
                return;
              }
            }
          } catch (err) {
            console.warn('No se pudo cargar desde el servidor, buscando en SQLite local:', err);
          }
        }

        // 2. Cargar desde SQLite local (para encuestadores o si está offline)
        const survey = await dbService.getSurveyById(Number(id));
        if (survey) {
          setFormData(survey);
          setOriginalDoc(survey.documento_identidad);
        }
      }
    }
    loadSurvey();

    // Reconciliación automática: si hay conexión, purgar encuestas eliminadas del servidor de SQLite local
    async function reconcileLocal() {
      if (navigator.onLine) {
        const authToken = token || localStorage.getItem('auth_token');
        await reconciliarEncuestasEliminadas(authToken);
      }
    }
    reconcileLocal();
  }, [id, isEditing, user?.rol, token]);

  const handleDocumentBlur = async () => {
    const doc = formData.documento_identidad?.trim() || '';
    if (doc.length < 5) {
      if (!isEditing && existingFound) {
        setFormData({
          tipo_documento: formData.tipo_documento || 'C.C',
          documento_identidad: doc,
          nombres: '',
          apellidos: '',
          telefono_1: '',
          telefono_2: '',
          telefono_3: '',
          direccion: '',
          profesion: '',
          fecha_registro: new Date().toISOString().split('T')[0],
          hora_registro: new Date().toTimeString().slice(0, 5),
          creado_en: new Date().toISOString(),
          estado_sincronizacion: 'pendiente'
        });
        setExistingFound(false);
        setNewPhoneInput('');
        setPhoneError('');
      }
      setConflictSurvey(null);
      return;
    }

    try {
      if (isEditing) {
        // Si el documento es el mismo que originalmente tenía esta encuesta, no hay conflicto
        if (originalDoc && doc === originalDoc) {
          setConflictSurvey(null);
          await verifySimilarity(doc, formData.nombres, formData.apellidos);
          return;
        }

        // El usuario modificó el documento durante la edición.
        // Verificar si este nuevo documento ya está asignado a OTRA encuesta.
        // Como la cédula ya cambió respecto a la original, cualquier registro con la nueva cédula es otra encuesta.
        // Se compara por cédula y no por id (los ids locales y del servidor no coinciden).

        // 1. Buscar en SQLite local (solo copias propias)
        let existing: Survey | undefined = await dbService.getSurveyByDocumento(doc);
        let ajena = !!existing && !esPropiaLocal(existing);
        if (ajena) existing = undefined;

        // 2. Si hay conexión, consultar el servidor central para validar estado real
        if (navigator.onLine) {
          try {
            const authToken = token || localStorage.getItem('auth_token');
            const res = await fetch(`${BACKEND_URL}/api/encuestas/verificar-documento/${encodeURIComponent(doc)}`, {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const remoteData = await res.json();
              if (remoteData?.ajeno) {
                ajena = true;
              } else if (remoteData?.documento_identidad) {
                existing = remoteData as Survey;
              }
            } else if (res.status === 404) {
              // Si el servidor confirma que NO existe (fue eliminada), purgar copia local residual
              if (existing) {
                await dbService.deleteSurveyByDocumento(doc);
                existing = undefined;
              }
            }
          } catch {
            // Ignorar fallo de red
          }
        }

        // Si la cédula pertenece a otro encuestador: solo se informa, sin datos de esa persona
        if (ajena) {
          setConflictoAjeno(true);
          setConflictSurvey({ documento_identidad: doc } as Survey);
          toast.error(MENSAJE_CEDULA_AJENA);
          setSimilarityWarnings([]);
          setShowSimilarityModal(false);
          return;
        }

        // Si ya existe otra encuesta propia con este documento
        if (existing) {
          setConflictoAjeno(false);
          setConflictSurvey(existing);
          toast.error(`El documento ${doc} ya pertenece a ${existing.nombres} ${existing.apellidos} (ID: #${existing.id || 'existente'}).`);
          setSimilarityWarnings([]);
          setShowSimilarityModal(false);
          return;
        }

        setConflictSurvey(null);
        // Si no hay conflicto exacto, verificar similitudes (Levenshtein) con otros registros
        await verifySimilarity(doc, formData.nombres, formData.apellidos);
      } else {
        // Modo creación de nueva encuesta
        // 1. Buscar primero en SQLite local (funciona offline). Solo copias propias.
        let existing: Survey | undefined = await dbService.getSurveyByDocumento(doc);
        let ajena = !!existing && !esPropiaLocal(existing);
        if (ajena) existing = undefined;

        // 2. Si hay conexión, consultar el servidor central
        if (navigator.onLine) {
          try {
            const authToken = token || localStorage.getItem('auth_token');
            const res = await fetch(`${BACKEND_URL}/api/encuestas/verificar-documento/${encodeURIComponent(doc)}`, {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const remoteData = await res.json();
              if (remoteData?.ajeno) {
                // Registro de otro encuestador: no se guarda ni se autocompleta nada
                ajena = true;
              } else if (remoteData?.documento_identidad) {
                await dbService.addSurvey({ ...remoteData, estado_sincronizacion: 'sincronizado' }, { desdeServidor: true });
                // El formulario usa el id LOCAL de la copia (no el del servidor) para cualquier escritura posterior
                const filaLocal = await dbService.getSurveyByDocumento(remoteData.documento_identidad);
                existing = { ...(remoteData as Survey), id: filaLocal?.id };
              }
            } else if (res.status === 404) {
              // Si el servidor confirma que NO existe (fue eliminada), purgar copia local residual
              if (existing) {
                await dbService.deleteSurveyByDocumento(doc);
                existing = undefined;
              }
            }
          } catch {
            // Fallo silencioso en modo offline
          }
        }

        if (ajena) {
          setConflictoAjeno(true);
          setConflictSurvey({ documento_identidad: doc } as Survey);
          toast.error(MENSAJE_CEDULA_AJENA);
          setSimilarityWarnings([]);
          setShowSimilarityModal(false);
          setExistingFound(false);
          return;
        }

        if (existing) {
          setFormData({
            ...existing,
            fecha_registro: new Date().toISOString().split('T')[0],
          });
          setNewPhoneInput('');
          setExistingFound(true);
          setSimilarityWarnings([]);
          setShowSimilarityModal(false);
          return;
        }

        // Si no se encontró y antes había datos autocompletados, vaciar los campos
        if (existingFound) {
          setFormData({
            tipo_documento: formData.tipo_documento || 'C.C',
            documento_identidad: doc,
            nombres: '',
            apellidos: '',
            telefono_1: '',
            telefono_2: '',
            telefono_3: '',
            direccion: '',
            profesion: '',
            fecha_registro: new Date().toISOString().split('T')[0],
            hora_registro: new Date().toTimeString().slice(0, 5),
            creado_en: new Date().toISOString(),
            estado_sincronizacion: 'pendiente'
          });
          setNewPhoneInput('');
          setPhoneError('');
        }

        setExistingFound(false);
        await verifySimilarity(doc, formData.nombres, formData.apellidos);
      }
    } catch (err) {
      console.warn('Error al verificar documento existente:', err);
    }
  };

  // Sin guardas de estado aquí: quien llama ya decidió. Un guard leería el estado VIEJO del render
  // (p. ej. existingFound=true tras una cédula anterior) y omitiría la verificación de duplicados.
  const verifySimilarity = async (doc: string, nombres?: string, apellidos?: string) => {
    const cleanDoc = doc?.trim() || '';
    if (cleanDoc.length < 5) return;

    setCheckingSimilarity(true);
    try {
      // Reconciliación previa: si hay conexión, verificar qué documentos siguen activos en el servidor
      // y purgar del almacenamiento local cualquier encuesta que haya sido eliminada en el servidor.
      if (navigator.onLine) {
        const authToken = token || localStorage.getItem('auth_token');
        await reconciliarEncuestasEliminadas(authToken);
      }

      // Paso A: Obtener datos ligeros del SQLite local (ya purgado y sin fantasmas eliminados)
      // Solo copias propias: los registros de otros encuestadores no se comparan ni se muestran
      const todoLocal = await dbService.getAllSurveysLight();
      const localLight = todoLocal.filter(esPropiaLocal);
      let avisoAjeno = todoLocal.length !== localLight.length;

      // Paso B: Si hay conexión, consultar el servidor VPS
      let remoteLight: typeof localLight = [];
      if (navigator.onLine) {
        try {
          const authToken = token || localStorage.getItem('auth_token');
          const queryParams = new URLSearchParams();
          if (nombres) queryParams.set('nombres', nombres);
          if (apellidos) queryParams.set('apellidos', apellidos);
          const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

          const res = await fetch(
            `${BACKEND_URL}/api/encuestas/buscar-similares/${encodeURIComponent(cleanDoc)}${qs}`,
            {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              signal: AbortSignal.timeout(5000),
            }
          );
          if (res.ok) {
            const datosRemotos: Array<(typeof localLight)[number] & { ajeno?: boolean }> = await res.json();
            if (datosRemotos.some((r) => r.ajeno)) avisoAjeno = true;
            remoteLight = datosRemotos.filter((r) => !r.ajeno);
          }
        } catch {
          // Sin conexión real o servidor caído → continuar con SQLite local
        }
      }

      // Combinar local + remoto sin duplicar por documento
      const localDocs = new Set(localLight.map(s => s.documento_identidad));
      let combined = [
        ...localLight,
        ...remoteLight.filter(r => !localDocs.has(r.documento_identidad)),
      ];

      // Si estamos editando, excluir la encuesta actual para que no se compare consigo misma
      if (isEditing) {
        // Se excluye por cédula (no por id: el id del servidor puede coincidir con un id local ajeno)
        combined = combined.filter(s => !(originalDoc && s.documento_identidad === originalDoc));
      }

      const matches = checkSimilarity(
        cleanDoc,
        nombres || formData.nombres || '',
        apellidos || formData.apellidos || '',
        combined
      );

      // Un registro de otro encuestador se informa sin ningún dato personal
      if (avisoAjeno) {
        matches.push({
          survey: { documento_identidad: '', nombres: 'Registro de otro encuestador', apellidos: '(consulte al administrador)', tipo_documento: '' },
          reason: MENSAJE_SIMILAR_AJENO,
          level: 'medium',
        });
      }

      if (matches.length > 0) {
        setSimilarityWarnings(matches);
        setShowSimilarityModal(true);
      } else {
        setSimilarityWarnings([]);
        setShowSimilarityModal(false);
      }
    } catch (simErr) {
      console.warn('Error en verificación de similitud:', simErr);
    } finally {
      setCheckingSimilarity(false);
    }
  };

  const handleNameBlur = async () => {
    if (!existingFound && !conflictSurvey && formData.documento_identidad && formData.nombres && formData.apellidos) {
      await verifySimilarity(formData.documento_identidad, formData.nombres, formData.apellidos);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!isEditing && existingFound && e.target.name === 'tipo_documento') {
      setFormData({
        tipo_documento: e.target.value,
        documento_identidad: formData.documento_identidad || '',
        nombres: '',
        apellidos: '',
        telefono_1: '',
        telefono_2: '',
        telefono_3: '',
        direccion: '',
        profesion: '',
        fecha_registro: new Date().toISOString().split('T')[0],
        hora_registro: new Date().toTimeString().slice(0, 5),
        creado_en: new Date().toISOString(),
        estado_sincronizacion: 'pendiente'
      });
      setExistingFound(false);
      setNewPhoneInput('');
      setPhoneError('');
      return;
    }

    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (conflictSurvey) {
      toast.error(conflictoAjeno ? MENSAJE_CEDULA_AJENA : `No se puede guardar: el documento ${formData.documento_identidad} ya está registrado en una encuesta propia.`);
      document.getElementById('input_documento_identidad')?.focus();
      return;
    }

    // Validación: Teléfono de contacto obligatorio y formato válido
    if (!isEditing && !existingFound) {
      if (!formData.telefono_1 || formData.telefono_1.trim() === '') {
        setPhoneError('El teléfono de contacto es obligatorio.');
        document.querySelector<HTMLElement>('.phone-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!isPossiblePhoneNumber(formData.telefono_1)) {
        setPhoneError('El número de teléfono está incompleto o no es válido para el país seleccionado.');
        document.querySelector<HTMLElement>('.phone-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    } else {
      const tieneAlgunTelefono =
        formData.telefono_1 || formData.telefono_2 || formData.telefono_3;
      if (!tieneAlgunTelefono && (!newPhoneInput || newPhoneInput.trim() === '')) {
        setPhoneError('Debe haber al menos un teléfono de contacto registrado.');
        document.querySelector<HTMLElement>('.phone-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (newPhoneInput && !isPossiblePhoneNumber(newPhoneInput)) {
        setPhoneError('El número de teléfono está incompleto o no es válido para el país seleccionado.');
        document.querySelector<HTMLElement>('.phone-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    setPhoneError('');
    setLoading(true);

    try {
      let finalData = { ...formData } as Survey;
      
      const currentPhones = [formData.telefono_1, formData.telefono_2, formData.telefono_3];
      const phoneToProcess = (isEditing || existingFound) ? newPhoneInput : formData.telefono_1;
      
      const updatedPhones = updatePhonesList(currentPhones, phoneToProcess);
      
      finalData.telefono_1 = updatedPhones[0] || '';
      finalData.telefono_2 = updatedPhones[1] || '';
      finalData.telefono_3 = updatedPhones[2] || '';

      // OFFLINE-FIRST: siempre guardamos como 'pendiente' en SQLite local.
      // El SyncService se encarga de enviarlo al servidor de forma segura cuando
      // haya conexión. Esto corrige el bug donde el admin en offline quedaba
      // marcado como 'sincronizado' sin haber llegado al servidor.
      finalData.estado_sincronizacion = 'pendiente';
      
      const now = new Date();
      if (!isEditing && !existingFound) {
        finalData.encuestador_id = user?.id;
        finalData.encuestador_usuario = user?.usuario;
        finalData.hora_registro = finalData.hora_registro || now.toTimeString().slice(0, 5);
        finalData.creado_en = finalData.creado_en || now.toISOString();
      } else {
        // Preservar el encuestador original; solo completar si faltaba
        finalData.encuestador_id = formData.encuestador_id || user?.id;
        finalData.encuestador_usuario = formData.encuestador_usuario || user?.usuario;
        if (!finalData.hora_registro) {
          finalData.hora_registro = now.toTimeString().slice(0, 5);
        }
        if (!finalData.creado_en) {
          finalData.creado_en = now.toISOString();
        }
      }

      // Escritura en SQLite. Se localiza la fila por CÉDULA y no por id: el id de la URL o del formulario
      // puede ser el del servidor (panel de admin o copia descargada), que no corresponde a la fila local.
      const escribirLocal = async (documentoOriginal: string) => {
        const fila = await dbService.getSurveyByDocumento(documentoOriginal || finalData.documento_identidad);
        if (fila?.id) {
          await dbService.updateSurvey(fila.id, finalData);
        } else {
          await dbService.addSurvey(finalData);
        }
      };

      if (isEditing) {
        if (user?.rol === 'admin' && (navigator.onLine || token)) {
          const authToken = token || localStorage.getItem('auth_token');
          try {
            const res = await fetch(`${BACKEND_URL}/api/admin/encuestas/${id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify(finalData),
              signal: AbortSignal.timeout(6000),
            });
            if (res.ok) {
              finalData.estado_sincronizacion = 'sincronizado';
            } else {
              const errData = await res.json().catch(() => ({}));
              toast.error(errData.error || 'Error al actualizar la encuesta en el servidor');
              setLoading(false);
              return;
            }
          } catch (err) {
            console.warn('No se pudo actualizar directamente en el servidor:', err);
          }
        }
        // Actualizar también en SQLite local si existe
        await escribirLocal(originalDoc).catch(() => {});
      } else if (existingFound) {
        // La persona ya existía: se actualiza su registro local por cédula
        await escribirLocal('').catch(() => {});
      } else {
        if (user?.rol === 'admin' && (navigator.onLine || token)) {
          const authToken = token || localStorage.getItem('auth_token');
          try {
            const res = await fetch(`${BACKEND_URL}/api/admin/encuestas`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify(finalData),
              signal: AbortSignal.timeout(6000),
            });
            if (res.ok) {
              const resData = await res.json();
              if (resData.encuesta?.id) {
                finalData.id = resData.encuesta.id;
              }
              finalData.estado_sincronizacion = 'sincronizado';
            }
          } catch (err) {
            console.warn('Error enviando encuesta directa admin:', err);
          }
        }
        await dbService.addSurvey(finalData);
      }
      
      // Disparar sincronización siempre (SyncService valida la alcanzabilidad internamente)
      window.dispatchEvent(new Event('trigger-sync'));
      
      toast.success(isEditing ? 'Encuesta actualizada con éxito' : 'Encuesta guardada con éxito');

      if (user?.rol === 'admin') {
        navigate(-1);
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Error saving survey:', error);
      toast.error('Error al guardar la encuesta.');
    } finally {
      setLoading(false);
    }
  };

  const handleCorrectDocument = () => {
    setShowSimilarityModal(false);
    setTimeout(() => {
      const input = document.getElementById('input_documento_identidad') as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>

      {/* ── Modal de advertencia de posible duplicado (Rediseñado) ─────────── */}
      {showSimilarityModal && similarityWarnings.length > 0 && (
        <div className="similarity-modal-overlay">
          <div className="similarity-modal-card">
            {/* Barra superior con gradiente de atención */}
            <div className="similarity-top-stripe" />

            <div className="similarity-modal-body">
              {/* Encabezado */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(239, 68, 68, 0.12))',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
                    flexShrink: 0
                  }}>
                    <AlertTriangle size={24} color="#f59e0b" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                      Posible registro duplicado
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.25rem' }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: navigator.onLine ? '#10b981' : '#f59e0b',
                        display: 'inline-block'
                      }} />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {navigator.onLine ? 'Verificado en servidor y base local' : 'Verificado en base local (sin conexión)'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSimilarityModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.4rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                  title="Cerrar"
                >
                  <X size={19} />
                </button>
              </div>

              {/* Comparador de documento digitado */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.7rem 0.95rem',
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.85rem',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {similarityWarnings.length === 1
                    ? 'Se detectó 1 registro similar a:'
                    : `Se detectaron ${similarityWarnings.length} registros similares a:`}
                </span>
                <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: 'var(--text-main)',
                  background: 'var(--surface)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '0.4rem',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  {formData.tipo_documento || 'Doc'}: {formData.documento_identidad}
                </span>
              </div>

              {/* Lista de registros coincidentes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem', maxHeight: '240px', overflowY: 'auto' }}>
                {similarityWarnings.map((match, i) => (
                  <div key={i} className="similarity-item-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, fontWeight: 700, fontSize: '0.85rem'
                        }}>
                          {(match.survey.nombres?.[0] || 'U').toUpperCase()}{(match.survey.apellidos?.[0] || '').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: 1.25 }}>
                            {match.survey.nombres} {match.survey.apellidos}
                          </div>
                          {match.survey.documento_identidad && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span>{match.survey.tipo_documento || 'Doc'}:</span>
                              <strong style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--text-main)' }}>
                                {match.survey.documento_identidad}
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '999px',
                        background: 'rgba(0,0,0,0.05)',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap'
                      }}>
                        En base de datos
                      </span>
                    </div>

                    <div className={`similarity-reason-badge ${match.level}`}>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      <span>{match.reason}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={handleCorrectDocument}
                  className="btn-similarity-correct"
                >
                  <Edit3 size={17} /> Corregir número de documento
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSimilarityModal(false);
                    setSimilarityWarnings([]);
                  }}
                  className="btn-similarity-continue"
                >
                  Continuar de todas formas (es una persona diferente) <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={() => navigate(-1)} className="btn btn-icon btn-outline">
          <ArrowLeft size={20} />
        </button>
        <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>
          {isEditing ? 'Editar Encuesta' : 'Nueva Encuesta'}
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="glass-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {conflictSurvey && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.85rem 1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderRadius: 'var(--radius-md)',
            color: '#ef4444',
            fontSize: '0.875rem'
          }}>
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div>
              {conflictoAjeno ? (
                <><strong>Cédula registrada por otro encuestador.</strong> El documento <strong>{formData.documento_identidad}</strong> ya existe en el sistema. Consulte al administrador; no se muestran datos de esa persona.</>
              ) : (
                <><strong>Conflicto de documento:</strong> El documento <strong>{formData.documento_identidad}</strong> ya está registrado en una encuesta propia (ID: #{conflictSurvey.id || 'existente'}). Debe especificar un número de documento no registrado.</>
              )}
            </div>
          </div>
        )}

        {existingFound && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#3b82f6',
            fontSize: '0.875rem'
          }}>
            <Info size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Persona ya registrada:</strong> Se cargaron sus datos guardados. Al guardar, se actualizará su información en lugar de crear un duplicado.
            </span>
          </div>
        )}

        <div className="responsive-grid">
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Documento de Identidad *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select name="tipo_documento" value={formData.tipo_documento || 'C.C'} onChange={handleChange} className="form-input" style={{ width: '30%', minWidth: '70px', padding: '0.5rem' }}>
                  <option value="C.C">C.C</option>
                  <option value="T.I">T.I</option>
                  <option value="C.E">C.E</option>
                  <option value="NIT">NIT</option>
                  <option value="PAS">PAS</option>
                </select>
                <input required type="text" id="input_documento_identidad" name="documento_identidad" value={formData.documento_identidad || ''} 
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    
                    if (!isEditing && existingFound) {
                      // Si los campos estaban autocompletados y el usuario cambia el documento,
                      // vaciamos todos los campos para que la nueva encuesta comience limpia
                      setFormData({
                        tipo_documento: formData.tipo_documento || 'C.C',
                        documento_identidad: val,
                        nombres: '',
                        apellidos: '',
                        telefono_1: '',
                        telefono_2: '',
                        telefono_3: '',
                        direccion: '',
                        profesion: '',
                        fecha_registro: new Date().toISOString().split('T')[0],
                        hora_registro: new Date().toTimeString().slice(0, 5),
                        creado_en: new Date().toISOString(),
                        estado_sincronizacion: 'pendiente'
                      });
                      setExistingFound(false);
                      setNewPhoneInput('');
                      setPhoneError('');
                    } else {
                      setFormData(prev => ({ ...prev, documento_identidad: val }));
                    }

                    if (conflictSurvey) setConflictSurvey(null);
                    // Limpiar advertencias si el usuario corrige el número
                    if (similarityWarnings.length > 0) setSimilarityWarnings([]);
                  }} 
                  onBlur={handleDocumentBlur}
                  maxLength={15}
                  className="form-input" 
                  placeholder="Ej. 123456789" 
                  style={{ 
                    width: '70%', 
                    flex: 1,
                    borderColor: conflictSurvey ? '#ef4444' : undefined,
                    boxShadow: conflictSurvey ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : undefined
                  }} 
                />
              </div>
              {conflictSurvey && (
                <span style={{ fontSize: '0.78rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertTriangle size={13} /> {conflictoAjeno ? 'Registrada por otro encuestador' : `Asignado a ${conflictSurvey.nombres} ${conflictSurvey.apellidos} (ID: #${conflictSurvey.id || 'existente'})`}
                </span>
              )}
              {checkingSimilarity && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                  🔍 Verificando similitud...
                </span>
              )}
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fecha de Registro *</label>
            <input required type="date" name="fecha_registro" value={formData.fecha_registro || ''} onChange={handleChange} className="form-input" />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombres *</label>
            <input required type="text" name="nombres" value={formData.nombres || ''} 
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z\sñÑáéíóúÁÉÍÓÚ]/g, '');
                setFormData({...formData, nombres: val});
              }} 
              onBlur={handleNameBlur}
              maxLength={50}
              className="form-input" placeholder="Ej. Juan Carlos" />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Apellidos *</label>
            <input required type="text" name="apellidos" value={formData.apellidos || ''} 
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z\sñÑáéíóúÁÉÍÓÚ]/g, '');
                setFormData({...formData, apellidos: val});
              }} 
              onBlur={handleNameBlur}
              maxLength={50}
              className="form-input" placeholder="Ej. Pérez" />
          </div>
          
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Profesión</label>
            <input type="text" name="profesion" value={formData.profesion || ''} onChange={handleChange} className="form-input" placeholder="Ej. Ingeniero" />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Dirección *</label>
            <input required type="text" name="direccion" value={formData.direccion || ''} onChange={handleChange} className="form-input" placeholder="Ej. Calle 123 #45-67" />
          </div>
        </div>

        <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Contacto</h3>
          
          {(isEditing || existingFound) ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Teléfonos registrados (Máx 3):</p>
                <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem', color: 'var(--text-main)', fontSize: '0.95rem' }}>
                  {formData.telefono_1 && <li>{formData.telefono_1} (Principal)</li>}
                  {formData.telefono_2 && <li>{formData.telefono_2}</li>}
                  {formData.telefono_3 && <li>{formData.telefono_3}</li>}
                </ul>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Agregar / Actualizar Teléfono</label>
                <PhoneInput 
                  defaultCountry="CO"
                  international
                  limitMaxLength={true}
                  value={newPhoneInput as any} 
                  onChange={(val) => {
                    if (val && isPhoneTooLong(val)) return;
                    setNewPhoneInput(val || '');
                    if (val && val.trim() !== '') setPhoneError('');
                  }} 
                  className={`form-input phone-wrapper${phoneError ? ' phone-input-error' : ''}`}
                  placeholder="Ej. 300 123 4567 (opcional si no cambia)" 
                />
                {phoneError && (
                  <p style={{
                    color: '#ef4444',
                    fontSize: '0.8rem',
                    marginTop: '0.4rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}>
                    ⚠️ {phoneError}
                  </p>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Si ingresas un nuevo número, pasará a ser el principal (Contacto 1) y los anteriores se conservarán automáticamente.
                </p>
              </div>
            </>
          ) : (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Teléfono de Contacto *</label>
              <PhoneInput 
                defaultCountry="CO"
                international
                limitMaxLength={true}
                value={(formData.telefono_1 as any) || ''} 
                onChange={(val) => {
                  if (val && isPhoneTooLong(val)) return;
                  setFormData({...formData, telefono_1: val || ''});
                  if (val && val.trim() !== '') setPhoneError('');
                }} 
                className={`form-input phone-wrapper${phoneError ? ' phone-input-error' : ''}`}
                placeholder="Ej. 300 123 4567" 
              />
              {phoneError && (
                <p style={{
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  marginTop: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}>
                  ⚠️ {phoneError}
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {isEditing ? 'Actualizar' : 'Guardar'}
          </button>
        </div>

      </form>
    </div>
  );
}
