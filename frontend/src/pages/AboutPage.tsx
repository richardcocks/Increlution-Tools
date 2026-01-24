import { Link } from 'react-router-dom';
import './StaticPage.css';

export default function AboutPage() {
  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>About</h1>
        <p>
          Loadout Manager for Increlution is a visual editor for configuring
          automation loadouts in the Increlution incremental game.
        </p>
        <p>
          Created by <a href="https://github.com/richardcocks" target="_blank" rel="noopener noreferrer">Richard Cocks</a>
        </p>
        <Link to="/">Back to Editor</Link>
      </div>
    </div>
  );
}
