import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
  return (
    <footer className="app-footer">
      <Link to="/about">About</Link>
      <span className="footer-separator">|</span>
      <Link to="/terms">Terms</Link>
    </footer>
  );
}
