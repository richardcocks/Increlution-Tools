import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
