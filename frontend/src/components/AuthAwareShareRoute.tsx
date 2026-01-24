import { useAuth } from '../contexts/AuthContext';
import { SharedLoadoutView } from './SharedLoadoutView';
import App from '../App';

export function AuthAwareShareRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  // If user is logged in, show App (which will handle the share token via useParams)
  // If not logged in, show the standalone SharedLoadoutView
  if (user) {
    return <App />;
  }

  return <SharedLoadoutView />;
}
