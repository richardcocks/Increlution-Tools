import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AuthAwareFolderShareRoute() {
  const { user, loading } = useAuth();
  const { token, loadoutId } = useParams<{ token: string; loadoutId?: string }>();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!token) {
    return <div className="app-loading">Invalid share link</div>;
  }

  const suffix = loadoutId ? `/${loadoutId}` : '';

  if (user) {
    return <Navigate to={`/loadouts/shared/folder/${token}${suffix}`} replace />;
  }

  return <Navigate to={`/guest/shared/folder/${token}${suffix}`} replace />;
}
