import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../db';
import { BACKEND_URL } from '../config';
import { LogIn, Download, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  // Obtener la URL de descarga más reciente del backend
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/version`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.url_descarga) {
          setApkUrl(data.url_descarga);
        }
      })
      .catch(() => console.log('No se pudo obtener la versión del APK'));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Autenticación local (SQLite)
      const user = await dbService.getUserByCredentials(usuario, password);
      if (!user) {
        setError('Usuario o contraseña incorrectos.');
        return;
      }

      // Para admins, también autenticamos contra el backend para obtener el JWT
      if (user.rol === 'admin') {
        try {
          const res = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password })
          });

          if (res.ok) {
            const data = await res.json();
            login(user, data.token);
          } else {
            // Si el backend no está disponible, login sin token (funcionalidades offline)
            console.warn('No se pudo obtener token del backend. Funciones online limitadas.');
            login(user);
          }
        } catch (backendErr) {
          // Backend no disponible - login offline
          console.warn('Backend no disponible:', backendErr);
          login(user);
        }
      } else {
        // Encuestadores: solo login local (trabajan offline)
        login(user);
      }

      if (user.rol === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError('Error al conectar con la base de datos local.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-view" style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      padding: '2rem'
    }}>
      <div className="glass-container" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            display: 'inline-flex', 
            padding: '1rem', 
            background: 'var(--primary)', 
            borderRadius: '50%', 
            marginBottom: '1rem',
            color: 'white',
            boxShadow: '0 10px 20px rgba(79, 70, 229, 0.4)'
          }}>
            <Lock size={32} />
          </div>
          <h1 className="app-title" style={{ fontSize: '1.75rem', margin: 0 }}>Acceso al Sistema</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {error && (
          <div style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#ef4444', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            textAlign: 'center',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} /> Usuario
            </label>
            <input 
              required 
              type="text" 
              value={usuario} 
              onChange={(e) => setUsuario(e.target.value)} 
              className="form-input" 
              placeholder="Ej. admin" 
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={16} /> Contraseña
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                required 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="form-input" 
                placeholder="••••••" 
                style={{ width: '100%', paddingRight: '2.5rem' }}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ 
                  position: 'absolute', 
                  right: '0.75rem', 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
            {loading ? 'Verificando...' : (
              <>
                <LogIn size={20} /> Iniciar Sesión
              </>
            )}
          </button>
        </form>
      </div>

      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          ¿Eres encuestador de campo?
        </p>
        <a 
          href={apkUrl || `${BACKEND_URL}/api/version/download`} 
          download 
          className="btn btn-outline" 
          style={{ 
            background: 'rgba(255, 255, 255, 0.1)', 
            border: '1px solid var(--border)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Download size={18} />
          Descargar App para Android (APK)
        </a>
      </div>
    </div>
  );
}
