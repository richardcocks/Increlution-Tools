import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
  return (
    <footer className="app-footer">
      <Link to="/about">About</Link>
    </footer>
  );
}
