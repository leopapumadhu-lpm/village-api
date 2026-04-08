import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AdminLogin from './pages/AdminLogin';
import B2BRegistration from './pages/B2BRegistration';
import AdminDashboard from './AdminDashboard';
import B2BDashboard from './pages/B2BDashboard';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/register" element={<B2BRegistration />} />

        {/* Protected routes */}
        <Route
          path="/admin"
          element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>}
        />
        <Route
          path="/b2b"
          element={<ProtectedRoute><B2BDashboard /></ProtectedRoute>}
        />

        {/* Redirects */}
        <Route path="/" element={<Navigate to={isAuthenticated ? "/admin" : "/login"} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
