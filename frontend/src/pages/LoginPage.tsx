import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPages.css';

export function LoginPage() {
  const { loginWithDiscord, user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      navigate('/loadouts');
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

        <div className="login-footer">
          <Link to="/">Back to home</Link>
          <span className="separator">|</span>
          <Link to="/about">About</Link>
        </div>
      </div>
    </div>
  );
}
