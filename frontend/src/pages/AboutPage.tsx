import { useNavigate } from 'react-router-dom';
import './StaticPage.css';

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>About</h1>
        <p>
          Loadout Manager for Increlution is a visual editor for configuring
          automation loadouts in the{' '}
          <a href="https://store.steampowered.com/app/1593350/Increlution/" target="_blank" rel="noopener noreferrer">Increlution</a>{' '}
          incremental game by Gniller.
        </p>
        <p>
          This Website created by{' '}Richard Cocks and is not an official site.
        </p>
        <p>
          Source available on GitHub - <a href="https://github.com/richardcocks/Increlution-Tools" target="_blank" rel="noopener noreferrer">Increlution-Tools</a>
        </p>
        <p className="version-text">Version {__APP_VERSION__}</p>
        <button onClick={() => navigate(-1)} className="back-button">Back</button>
      </div>
    </div >
  );
}
