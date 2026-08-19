import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dbService, type Survey } from '../db';
import { updatePhonesList } from '../services/phoneLogic';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useAuth } from '../context/AuthContext';
import { BACKEND_URL } from '../config';

export default function SurveyForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
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

  useEffect(() => {
    async function loadSurvey() {
      if (isEditing) {
        try {
          const authToken = token || localStorage.getItem('auth_token');
          if (navigator.onLine && (user?.rol === 'admin' || authToken)) {
            const res = await fetch(`${BACKEND_URL}/api/admin/encuestas/${id}`, {
              headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
            });
            if (res.ok) {
              const remoteSurvey = await res.json();
              if (remoteSurvey) {
                setFormData(remoteSurvey);
                return;
              }
            }
          }
        } catch (err) {
          console.warn('Fallback a encuesta local SQLite:', err);
        }

        const survey = await dbService.getSurveyById(Number(id));
        if (survey) {
          setFormData(survey);
        }
      }
    }
    loadSurvey();
  }, [id, isEditing, token, user?.rol]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let finalData = { ...formData } as Survey;
      
      let currentPhones = [formData.telefono_1, formData.telefono_2, formData.telefono_3];
      const phoneToProcess = isEditing ? newPhoneInput : formData.telefono_1;
      
      const updatedPhones = updatePhonesList(currentPhones, phoneToProcess);
      
      finalData.telefono_1 = updatedPhones[0] || '';
      finalData.telefono_2 = updatedPhones[1] || '';
      finalData.telefono_3 = updatedPhones[2] || '';
      finalData.estado_sincronizacion = user?.rol === 'admin' ? 'sincronizado' : 'pendiente';
      
      if (!isEditing) {
        finalData.encuestador_id = user?.id;
        finalData.encuestador_usuario = user?.usuario;
      } else {
        finalData.encuestador_id = formData.encuestador_id || user?.id;
        finalData.encuestador_usuario = formData.encuestador_usuario || user?.usuario;
      }

      if (isEditing) {
        if (navigator.onLine && (user?.rol === 'admin' || token)) {
          const authToken = token || localStorage.getItem('auth_token');
          await fetch(`${BACKEND_URL}/api/admin/encuestas/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
            },
            body: JSON.stringify(finalData)
          }).catch(console.warn);
        }
        await dbService.updateSurvey(Number(id), finalData);
      } else {
        await dbService.addSurvey(finalData);
      }
      
      // Disparar evento para que el SyncService actúe de inmediato
      if (navigator.onLine) {
        window.dispatchEvent(new Event('trigger-sync'));
      }
      
      if (user?.rol === 'admin') {
        navigate(-1);
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Error saving survey:', error);
      alert('Error al guardar la encuesta.');
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
                  value={newPhoneInput as any} 
                  onChange={(val) => setNewPhoneInput(val || '')} 
                  className="form-input phone-wrapper"
                  placeholder="Ej. 300 123 4567" 
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Al guardar, este número pasará a ser el principal (Contacto 1) y los demás se ajustarán automáticamente.
                </p>
              </div>
            </>
          ) : (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Teléfono de Contacto 1 *</label>
              <PhoneInput 
                defaultCountry="CO"
                international
                value={(formData.telefono_1 as any) || ''} 
                onChange={(val) => setFormData({...formData, telefono_1: val || ''})} 
                className="form-input phone-wrapper"
                placeholder="Ej. 300 123 4567" 
              />
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
