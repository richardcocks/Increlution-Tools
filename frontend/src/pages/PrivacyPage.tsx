import { useNavigate } from 'react-router-dom';
import './StaticPage.css';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>Privacy</h1>
        <p>
          Privacy policy coming soon.
        </p>
        <button onClick={() => navigate(-1)} className="back-button">Back</button>
      </div>
    </div>
  );
}
