import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import App from '../App';
import { AnonymousSharedFolder } from './AnonymousSharedFolder';

export function AuthAwareFolderShareRoute() {
  const { user, loading } = useAuth();
  const { folderToken, loadoutId } = useParams<{ folderToken: string; loadoutId?: string }>();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!folderToken) {
    return <div className="app-loading">Invalid share link</div>;
  }

  // Authenticated user: render App inline (handles shared folder via useParams)
  if (user) {
    return <App />;
  }

  // Anonymous viewer: lightweight read-only view (no guest profile creation)
  const parsedLoadoutId = loadoutId ? parseInt(loadoutId, 10) : undefined;
  return <AnonymousSharedFolder token={folderToken} selectedLoadoutId={parsedLoadoutId} />;
}
