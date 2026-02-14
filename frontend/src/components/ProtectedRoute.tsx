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

  // Check for share return URL (from anonymous share view → login flow).
  // This takes priority over migration to avoid interrupting the share experience.
  const shareReturnUrl = sessionStorage.getItem('share_return_url');
  if (shareReturnUrl && location.pathname !== shareReturnUrl) {
    sessionStorage.removeItem('share_return_url');
    return <Navigate to={shareReturnUrl} replace />;
  }

  // Redirect to migration page if guest data exists (e.g. after Discord OAuth callback)
  if (location.pathname !== '/migrate' && hasGuestData()) {
    return <Navigate to="/migrate" replace />;
  }

  return <>{children}</>;
}
