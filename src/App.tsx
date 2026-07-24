import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SurveyList from './pages/SurveyList';
import SurveyForm from './pages/SurveyForm';
import SyncService from './components/SyncService';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import EncuestadoresList from './pages/admin/EncuestadoresList';
import EncuestadorDetalle from './pages/admin/EncuestadorDetalle';

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
        <Route path="/admin/encuestadores" element={<ProtectedRoute allowedRole="admin"><EncuestadoresList /></ProtectedRoute>} />
        <Route path="/admin/encuestadores/:id" element={<ProtectedRoute allowedRole="admin"><EncuestadorDetalle /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
