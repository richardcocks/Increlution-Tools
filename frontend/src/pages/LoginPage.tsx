import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { hasGuestData } from '../services/guestMigration';
import './AuthPages.css';

export function LoginPage() {
  const { loginWithDiscord, user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const [devUsername, setDevUsername] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      navigate(hasGuestData() ? '/migrate' : '/loadouts');
    }
  }, [user, loading, navigate]);

  const getErrorMessage = (errorCode: string | null): string | null => {
    if (!errorCode) return null;

    switch (errorCode) {
      case 'access_denied':
        return 'Discord authorization was denied.';
      case 'invalid_state':
        return 'Security validation failed. Please try again.';
      case 'token_exchange_failed':
        return 'Failed to complete authentication. Please try again.';
      case 'auth_failed':
        return 'Authentication failed. Please try again.';
      default:
        return 'An error occurred during sign in. Please try again.';
    }
  };

  const errorMessage = getErrorMessage(error);

  const handleDevLogin = async () => {
    if (!devUsername.trim()) {
      setDevError('Username is required');
      return;
    }
    setDevLoading(true);
    setDevError(null);
    try {
      await api.devLogin(devUsername.trim());
      await refreshUser();
      navigate(hasGuestData() ? '/migrate' : '/loadouts');
    } catch (err) {
      setDevError(err instanceof Error ? err.message : 'Dev login failed');
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container login-container">
        <div className="login-header">
          <h1>Loadout Manager for Increlution</h1>
          <p className="login-subtitle">
            Create and manage your automation loadouts
          </p>
        </div>

        {errorMessage && <div className="auth-error">{errorMessage}</div>}

        <button
          className="discord-login-button"
          onClick={loginWithDiscord}
          disabled={loading}
        >
          <i className="fab fa-discord" />
          Continue with Discord
        </button>

        <div className="login-privacy">
          <i className="fas fa-shield-alt" />
          <span>We only access your Discord username. No email or personal data is stored.</span>
        </div>

        <div className="login-or-divider">
          <span>or</span>
        </div>

        <Link to="/guest" className="guest-login-button">
          <i className="fas fa-user" />
          Continue as Guest
        </Link>
        <p className="guest-login-note">
          Data saved to this browser only. No account required.
        </p>

        <div className="login-footer">
          <Link to="/">Back to home</Link>
          <span className="separator">|</span>
          <Link to="/about">About</Link>
        </div>

        {import.meta.env.DEV && (
          <div className="dev-login-section">
            <div className="dev-login-divider">
              <span>Development Only</span>
            </div>
            <div className="dev-login-form">
              <input
                type="text"
                value={devUsername}
                onChange={(e) => setDevUsername(e.target.value)}
                placeholder="Test username (e.g., TestUser1)"
                className="dev-login-input"
                onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
              />
              <button
                className="dev-login-button"
                onClick={handleDevLogin}
                disabled={devLoading}
              >
                {devLoading ? 'Logging in...' : 'Dev Login'}
              </button>
            </div>
            {devError && <div className="dev-login-error">{devError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
