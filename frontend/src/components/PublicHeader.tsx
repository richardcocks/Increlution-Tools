import { Link } from 'react-router-dom';
import './PublicHeader.css';

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link to="/" className="public-header-title">
        Loadout Manager for Increlution
      </Link>
      <Link to="/login" className="public-header-login">
        <i className="fab fa-discord" />
        Sign In
      </Link>
    </header>
  );
}
