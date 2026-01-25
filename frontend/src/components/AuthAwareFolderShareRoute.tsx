import { useAuth } from '../contexts/AuthContext';
import { SharedFolderView } from './SharedFolderView';

export function AuthAwareFolderShareRoute() {
  const { loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  // For folder shares, we show the same SharedFolderView for both logged-in and anonymous users
  // The view itself handles the differences (save button visibility, etc.)
  return <SharedFolderView />;
}
