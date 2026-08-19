import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import SurveyList from './pages/SurveyList';
import SurveyForm from './pages/SurveyForm';
import SyncService from './components/SyncService';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import EncuestadoresList from './pages/admin/EncuestadoresList';
import EncuestadorDetalle from './pages/admin/EncuestadorDetalle';
import AdminActualizaciones from './pages/admin/AdminActualizaciones';
import AdminEncuestasList from './pages/admin/AdminEncuestasList';

function ProtectedRoute({ children, allowedRole }: { children: React.ReactNode, allowedRole?: 'admin' | 'encuestador' }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRole && user.rol !== allowedRole) {
    return <Navigate to={user.rol === 'admin' ? '/admin' : '/'} />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <SyncService />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Rutas de Encuestador */}
        <Route path="/" element={<ProtectedRoute allowedRole="encuestador"><SurveyList /></ProtectedRoute>} />
        <Route path="/new" element={<ProtectedRoute allowedRole="encuestador"><SurveyForm /></ProtectedRoute>} />
        <Route path="/edit/:id" element={<ProtectedRoute allowedRole="encuestador"><SurveyForm /></ProtectedRoute>} />

        {/* Rutas de Administrador */}
        <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><Dashboard /></ProtectedRoute>} />
        <Route path="/admin/encuestas" element={<ProtectedRoute allowedRole="admin"><AdminEncuestasList /></ProtectedRoute>} />
        <Route path="/admin/new" element={<ProtectedRoute allowedRole="admin"><SurveyForm /></ProtectedRoute>} />
        <Route path="/admin/edit/:id" element={<ProtectedRoute allowedRole="admin"><SurveyForm /></ProtectedRoute>} />
        <Route path="/admin/encuestadores" element={<ProtectedRoute allowedRole="admin"><EncuestadoresList /></ProtectedRoute>} />
        <Route path="/admin/encuestadores/:id" element={<ProtectedRoute allowedRole="admin"><EncuestadorDetalle /></ProtectedRoute>} />
        <Route path="/admin/actualizaciones" element={<ProtectedRoute allowedRole="admin"><AdminActualizaciones /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
