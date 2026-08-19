import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dbService } from '../../db';
import type { User } from '../../db';
import { BACKEND_URL } from '../../config';
import { ArrowLeft, UserPlus, Trash2, Edit2, ChevronRight, Save, X } from 'lucide-react';

export default function EncuestadoresList() {
  const navigate = useNavigate();
  const [encuestadores, setEncuestadores] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nombre: '', usuario: '', password: '' });

  const loadEncuestadores = async () => {
    setLoading(true);
    try {
      // 1. Intentar cargar desde el backend si estamos online
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const remoteUsers: User[] = await res.json();
          setEncuestadores(remoteUsers);
          // Sincronizar en SQLite local en segundo plano
          for (const u of remoteUsers) {
            const localU = await dbService.getUserByCredentials(u.usuario);
            if (!localU) {
              await dbService.addUsuario({
                nombre: u.nombre,
                usuario: u.usuario,
                password: 'password_vps',
                rol: 'encuestador'
              });
            }
          }
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Fallback a encuestadores locales de SQLite:', err);
    }

    const data = await dbService.getAllEncuestadores();
    setEncuestadores(data);
    setLoading(false);
  };

  useEffect(() => {
    loadEncuestadores();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUser: User = {
      nombre: formData.nombre,
      usuario: formData.usuario,
      password: formData.password,
      rol: 'encuestador'
    };

    try {
      // Enviar al backend si estamos online
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        if (editingId) {
          await fetch(`${BACKEND_URL}/api/admin/encuestadores/${editingId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(newUser)
          }).catch(console.warn);
        } else {
          await fetch(`${BACKEND_URL}/api/admin/encuestadores`, {
            method: 'POST',
            headers,
            body: JSON.stringify(newUser)
          }).catch(console.warn);
        }
      }

      // Guardar en SQLite local
      if (editingId) {
        await dbService.updateUsuario(editingId, newUser);
      } else {
        await dbService.addUsuario(newUser);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ nombre: '', usuario: '', password: '' });
      loadEncuestadores();
    } catch (error) {
      console.error(error);
      alert('Error al guardar el usuario. (¿Usuario duplicado?)');
    }
  };

  const handleEdit = (user: User) => {
    setFormData({ nombre: user.nombre, usuario: user.usuario, password: user.password || '' });
    setEditingId(user.id || null);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Estás seguro de eliminar este encuestador?')) {
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        await fetch(`${BACKEND_URL}/api/admin/encuestadores/${id}`, {
          method: 'DELETE',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).catch(console.warn);
      }
      await dbService.deleteUsuario(id);
      loadEncuestadores();
    }
  };

  return (
    <div className="page-view container" style={{ paddingTop: '2rem' }}>
      <header className="page-header">
        <div className="page-header-info">
          <button onClick={() => navigate('/admin')} className="btn btn-icon btn-outline" title="Volver al panel">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>Gestión de Encuestadores</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Administra el personal de campo</p>
          </div>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setFormData({ nombre: '', usuario: '', password: '' }); }} className="btn btn-primary">
          <UserPlus size={18} /> <span>Nuevo Encuestador</span>
        </button>
      </header>

      {showForm && (
        <div className="glass-container" style={{ marginBottom: '2rem', border: '1px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar Encuestador' : 'Nuevo Encuestador'}</h3>
            <button onClick={() => setShowForm(false)} className="btn btn-icon" style={{ background: 'transparent' }}><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre Completo</label>
              <input required type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="form-input" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre de Usuario (Para login)</label>
              <input required type="text" value={formData.usuario} onChange={e => setFormData({...formData, usuario: e.target.value.toLowerCase()})} className="form-input" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contraseña</label>
              <input required type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="form-input" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                <Save size={18} /> Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>Cargando encuestadores...</p>
        </div>
      ) : encuestadores.length === 0 ? (
        <div className="glass-container" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No hay encuestadores registrados.</p>
        </div>
      ) : (
        <div className="encuestadores-grid">
          {encuestadores.map(encuestador => (
            <div key={encuestador.id} className="glass-container encuestador-card">
              <div className="encuestador-card-header">
                <div className="encuestador-avatar">
                  {encuestador.nombre ? encuestador.nombre.charAt(0).toUpperCase() : 'E'}
                </div>
                <div className="encuestador-info">
                  <h3 className="encuestador-nombre">{encuestador.nombre}</h3>
                  <span className="encuestador-user-tag">@{encuestador.usuario}</span>
                </div>
                <div className="encuestador-top-actions">
                  <button onClick={() => handleEdit(encuestador)} className="btn btn-icon btn-outline" title="Editar">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => handleDelete(encuestador.id!)} className="btn btn-icon btn-outline" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }} title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              
              <div className="encuestador-card-footer">
                <Link to={`/admin/encuestadores/${encuestador.id}`} className="btn btn-primary" style={{ padding: '0.65rem 1rem' }}>
                  <span>Ver Encuestas</span> <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
