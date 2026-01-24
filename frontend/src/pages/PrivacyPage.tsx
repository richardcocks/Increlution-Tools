import { Link } from 'react-router-dom';
import './StaticPage.css';

export default function PrivacyPage() {
  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>Privacy</h1>
        <p>
          Privacy policy coming soon.
        </p>
        <Link to="/">Back to Editor</Link>
      </div>
    </div>
  );
}
