import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

export function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="landing-page">
        <div className="landing-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <h1 className="landing-title">Loadout Manager for Increlution</h1>
        <p className="landing-subtitle">
          Visually configure your automation priorities for all actions in Increlution.
          Create, organize, and share loadouts with ease.
        </p>

        <div className="landing-cta">
          {user ? (
            <Link to="/loadouts" className="landing-button primary">
              <i className="fas fa-play" />
              Go to Editor
            </Link>
          ) : (
            <Link to="/login" className="landing-button primary">
              <i className="fab fa-discord" />
              Sign In with Discord
            </Link>
          )}
        </div>
      </div>

      <div className="landing-features">
        <div className="feature-card">
          <i className="fas fa-sliders-h feature-icon" />
          <h3>Visual Editor</h3>
          <p>Intuitive wheel controls to set automation levels from Off to Top priority.</p>
        </div>
        <div className="feature-card">
          <i className="fas fa-folder-tree feature-icon" />
          <h3>Organize Loadouts</h3>
          <p>Create folders to organize your loadouts. Drag and drop to rearrange.</p>
        </div>
        <div className="feature-card">
          <i className="fas fa-share-alt feature-icon" />
          <h3>Share with Others</h3>
          <p>Generate share links with optional expiration and attribution settings.</p>
        </div>
        <div className="feature-card">
          <i className="fas fa-file-import feature-icon" />
          <h3>Import & Export</h3>
          <p>Compatible with Increlution's native format. Copy, paste, or use files.</p>
        </div>
      </div>
    </div>
  );
}
