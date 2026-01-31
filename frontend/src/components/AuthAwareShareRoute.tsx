import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import App from '../App';

export function AuthAwareShareRoute() {
  const { user, loading } = useAuth();
  const { token } = useParams<{ token: string }>();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  // If user is logged in, show App (which will handle the share token via useParams)
  if (user) {
    return <App />;
  }

  // Redirect guests to the guest embedded view
  return <Navigate to={`/guest/shared/${token}`} replace />;
}
