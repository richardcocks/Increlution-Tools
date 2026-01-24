import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import './DeleteAccountPage.css';

export function DeleteAccountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmText === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await api.deleteAccount();
      // Backend already signed us out, just redirect to landing page
      // Use window.location to ensure clean state
      window.location.href = '/';
    } catch {
      setError('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    navigate('/settings');
  };

  return (
    <div className="delete-account-page">
      <div className="delete-account-container">
        <div className="delete-account-header">
          <i className="fas fa-exclamation-triangle warning-icon" />
          <h1>Delete Account</h1>
        </div>

        <div className="delete-account-content">
          <div className="warning-box">
            <h2>This action cannot be undone</h2>
            <p>
              You are about to permanently delete your account
              {user?.username && <strong> ({user.username})</strong>}.
            </p>
          </div>

          <div className="deletion-details">
            <h3>The following will be permanently deleted:</h3>
            <ul>
              <li><i className="fas fa-folder" /> All your folders</li>
              <li><i className="fas fa-file-alt" /> All your loadouts</li>
              <li><i className="fas fa-share-alt" /> All share links you've created</li>
              <li><i className="fas fa-bookmark" /> All loadouts you've saved from others</li>
              <li><i className="fas fa-cog" /> All your settings and preferences</li>
              <li><i className="fas fa-user" /> Your user account</li>
            </ul>
          </div>

          <div className="confirm-section">
            <label htmlFor="confirm-input">
              To confirm, type <strong>DELETE</strong> below:
            </label>
            <input
              id="confirm-input"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>

          {error && (
            <div className="error-message">
              <i className="fas fa-exclamation-circle" />
              {error}
            </div>
          )}

          <div className="action-buttons">
            <button
              className="cancel-button"
              onClick={handleCancel}
              disabled={isDeleting}
            >
              <i className="fas fa-arrow-left" />
              Cancel - Keep My Account
            </button>
            <button
              className="delete-button"
              onClick={handleDelete}
              disabled={!isConfirmed || isDeleting}
            >
              {isDeleting ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <i className="fas fa-trash" />
                  Permanently Delete Account
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
