import { useNavigate } from 'react-router-dom';
import './StaticPage.css';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>Terms &amp; Conditions</h1>
        <p>
          By using Loadout Manager for Increlution, you agree to the following terms.
        </p>

        <h2>Use of Service</h2>
        <p>
          This website is provided as-is, free of charge, with no guarantees of
          availability or uptime. The service may be modified or discontinued at
          any time without notice.
        </p>

        <h2>Accounts</h2>
        <p>
          Authentication is handled via Discord OAuth. We store only your Discord
          ID and username. No email or password is stored. You may delete your
          account and all associated data at any time from the settings page.
        </p>

        <h2>User Data</h2>
        <p>
          Loadouts, folders, and settings you create are stored on our servers.
          Shared content is accessible to anyone with the share link. You are
          responsible for the content you share.
        </p>

        <h2>Disclaimer</h2>
        <p>
          This is an unofficial fan project and is not affiliated with or
          endorsed by Gniller or the Increlution game. The service is provided
          without warranty of any kind.
        </p>

        <button onClick={() => navigate(-1)} className="back-button">Back</button>
      </div>
    </div>
  );
}
