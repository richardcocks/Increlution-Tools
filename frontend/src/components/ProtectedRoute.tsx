import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasGuestData } from '../services/guestMigration';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to migration page if guest data exists (e.g. after Discord OAuth callback)
  if (location.pathname !== '/migrate' && hasGuestData()) {
    return <Navigate to="/migrate" replace />;
  }

  return <>{children}</>;
}
