import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';

import CreatorDashboard from './pages/CreatorDashboard';
import ClipperDashboard from './pages/ClipperDashboard';
import AdminDashboard from './pages/AdminDashboard';

import PrivateRoute from './components/PrivateRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rotas Públicas */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Rotas Privadas - Criador */}
        <Route 
          path="/creator-dashboard" 
          element={
            <PrivateRoute requiredRole="creator">
              <CreatorDashboard />
            </PrivateRoute>
          } 
        />

        {/* Rotas Privadas - Clipador (Futuro) */}
        <Route 
          path="/clipper-dashboard" 
          element={
            <PrivateRoute requiredRole="clipper">
              <ClipperDashboard />
            </PrivateRoute>
          } 
        /> 

      <Route 
          path="/admin-dashboard" 
          element={
            <PrivateRoute requiredRole="admin">
              <AdminDashboard />
            </PrivateRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
