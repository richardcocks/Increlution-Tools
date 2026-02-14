import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import App from '../App';
import { AnonymousSharedLoadout } from './AnonymousSharedLoadout';

export function AuthAwareShareRoute() {
  const { user, loading } = useAuth();
  const { token } = useParams<{ token: string }>();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!token) {
    return <div className="app-loading">Invalid share link</div>;
  }

  // If user is logged in, show App (which will handle the share token via useParams)
  if (user) {
    return <App />;
  }

  // Anonymous viewer: lightweight read-only view (no guest profile creation)
  return <AnonymousSharedLoadout token={token} />;
}
