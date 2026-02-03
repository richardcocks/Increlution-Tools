import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { EmbeddedSharedFolder } from './EmbeddedSharedFolder';
import './AuthAwareFolderShareRoute.css';

export function AuthAwareFolderShareRoute() {
  const { user, loading, logout } = useAuth();
  const { themePreference, effectiveTheme, cycleTheme } = useTheme();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!token) {
    return <div className="app-loading">Invalid share link</div>;
  }

  // If user is logged in, show embedded folder view with app header
  if (user) {
    const handleClose = () => {
      navigate('/loadouts');
    };

    const handleLogout = async () => {
      await logout();
      navigate('/');
    };

    return (
      <div className="embedded-folder-page">
        <div className="embedded-folder-page-header">
          <Link to="/loadouts" className="app-title">Loadout Manager for Increlution</Link>
          <div className="user-info">
            <span className="user-email">{user.username}</span>
            <button
              className="theme-toggle-button"
              onClick={cycleTheme}
              title={`Theme: ${themePreference} (currently ${effectiveTheme})`}
            >
              {themePreference === 'system' ? (
                <span className="theme-icon-system">
                  <i className="fas fa-sun" />
                  <i className="fas fa-moon" />
                </span>
              ) : (
                <i className={`fas ${effectiveTheme === 'dark' ? 'fa-moon' : 'fa-sun'}`} />
              )}
            </button>
            <button className="logout-button" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" />
              Logout
            </button>
          </div>
        </div>
        <div className="embedded-folder-page-body">
          <EmbeddedSharedFolder token={token} onClose={handleClose} />
        </div>
      </div>
    );
  }

  // Redirect guests to the guest embedded view
  return <Navigate to={`/guest/shared/folder/${token}`} replace />;
}
