import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dbService, type Survey } from '../db';
import { updatePhonesList } from '../services/phoneLogic';
import { ArrowLeft, Save, Loader2, Info } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import { isPossiblePhoneNumber, validatePhoneNumberLength } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BACKEND_URL } from '../config';


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
    profesion: '',
    estado_sincronizacion: 'pendiente'
  });

  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [existingFound, setExistingFound] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    async function loadSurvey() {
      if (isEditing) {
        // 1. Si es administrador (o tiene token) y hay red, cargar del servidor centralizado
        //    ya que los IDs mostrados en el panel de administración provienen de PostgreSQL.
        if (user?.rol === 'admin' || token) {
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
        }
      }
    }
    loadSurvey();
  }, [id, isEditing, user?.rol, token]);

  const handleDocumentBlur = async () => {
    if (!isEditing && formData.documento_identidad && formData.documento_identidad.trim().length >= 5) {
      try {
        const doc = formData.documento_identidad.trim();

        // 1. Buscar primero en SQLite local (funciona offline)
        let existing: Survey | undefined = await dbService.getSurveyByDocumento(doc);

        // 2. Si no está localmente Y hay conexión, consultar el servidor.
        //    Esto detecta encuestas registradas por otros encuestadores o por el admin,
        //    que no están en el SQLite local de este dispositivo.
        if (!existing && navigator.onLine) {
          try {
            const authToken = token || localStorage.getItem('auth_token');
            const res = await fetch(`${BACKEND_URL}/api/encuestas/verificar-documento/${doc}`, {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
              const remoteData = await res.json();
              if (remoteData?.documento_identidad) {
                existing = remoteData as Survey;
                // Guardar en SQLite local como 'sincronizado' para uso offline futuro
                await dbService.addSurvey({ ...remoteData, estado_sincronizacion: 'sincronizado' });
              }
            }
          } catch {
            // Fallo silencioso: si no se puede consultar el servidor, continuar con datos locales
          }
        }

        if (existing) {
          setFormData({
            ...existing,
            fecha_registro: new Date().toISOString().split('T')[0]
          });
          setExistingFound(true);
        } else {
          setExistingFound(false);
        }
      } catch (err) {
        console.warn('Error al verificar documento existente:', err);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validación: Teléfono de contacto obligatorio y formato válido
    if (!isEditing) {
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
      const phoneToProcess = isEditing ? newPhoneInput : formData.telefono_1;
      
      const updatedPhones = updatePhonesList(currentPhones, phoneToProcess);
      
      finalData.telefono_1 = updatedPhones[0] || '';
      finalData.telefono_2 = updatedPhones[1] || '';
      finalData.telefono_3 = updatedPhones[2] || '';

      // OFFLINE-FIRST: siempre guardamos como 'pendiente' en SQLite local.
      // El SyncService se encarga de enviarlo al servidor de forma segura cuando
      // haya conexión. Esto corrige el bug donde el admin en offline quedaba
      // marcado como 'sincronizado' sin haber llegado al servidor.
      finalData.estado_sincronizacion = 'pendiente';
      
      if (!isEditing) {
        finalData.encuestador_id = user?.id;
        finalData.encuestador_usuario = user?.usuario;
      } else {
        // Preservar el encuestador original; solo completar si faltaba
        finalData.encuestador_id = formData.encuestador_id || user?.id;
        finalData.encuestador_usuario = formData.encuestador_usuario || user?.usuario;
      }

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
            }
          } catch (err) {
            console.warn('No se pudo actualizar directamente en el servidor:', err);
          }
        }
        // Actualizar también en SQLite local si existe
        await dbService.updateSurvey(Number(id), finalData).catch(() => {});
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

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={() => navigate(-1)} className="btn btn-icon btn-outline">
          <ArrowLeft size={20} />
        </button>
        <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>
          {isEditing ? 'Editar Encuesta' : 'Nueva Encuesta'}
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="glass-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select name="tipo_documento" value={formData.tipo_documento || 'C.C'} onChange={handleChange} className="form-input" style={{ width: '30%', minWidth: '70px', padding: '0.5rem' }}>
                <option value="C.C">C.C</option>
                <option value="T.I">T.I</option>
                <option value="C.E">C.E</option>
                <option value="NIT">NIT</option>
                <option value="PAS">PAS</option>
              </select>
              <input required type="text" name="documento_identidad" value={formData.documento_identidad || ''} 
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setFormData({...formData, documento_identidad: val});
                }} 
                onBlur={handleDocumentBlur}
                maxLength={15}
                className="form-input" placeholder="Ej. 123456789" style={{ width: '70%', flex: 1 }} />
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
          
          {isEditing ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Teléfonos actuales (Máx 3):</p>
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
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Al guardar, este número pasará a ser el principal (Contacto 1) y los demás se ajustarán automáticamente.
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
