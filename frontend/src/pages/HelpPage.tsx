import './HelpPage.css';

export function HelpPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-page">
      <div className="help-header">
        <div className="help-header-content">
          <button className="back-button" onClick={onClose}>
            <i className="fas fa-arrow-left" />
            Back
          </button>
          <h2>Help</h2>
        </div>
      </div>

      <div className="help-content">
        <section className="help-section">
          <h3>Keyboard Shortcuts</h3>
          <div className="shortcuts-table">
            <div className="shortcut-row">
              <span className="shortcut-key">Click</span>
              <span className="shortcut-desc">Increase automation level (Off → Low → Regular → High → Top)</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Right-click</span>
              <span className="shortcut-desc">Decrease automation level</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + Click (wheel)</span>
              <span className="shortcut-desc">Set to maximum (Top) or minimum (Off)</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + Click (row)</span>
              <span className="shortcut-desc">Toggle lock (locked actions use game defaults)</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + V</span>
              <span className="shortcut-desc">Import loadout from clipboard</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Middle-click (sidebar)</span>
              <span className="shortcut-desc">Quick export loadout to clipboard</span>
            </div>
          </div>
        </section>

        <section className="help-section">
          <h3>Getting Started</h3>
          <ol className="help-list">
            <li>Create a new loadout using the sidebar or folder view</li>
            <li>Click on the automation wheel next to each action to set its level</li>
            <li>Use "Export (Clipboard)" to copy your loadout</li>
            <li>In Increlution, press F1 to open Automations and click Import</li>
          </ol>
        </section>

        <section className="help-section">
          <h3>Import from Game</h3>
          <ol className="help-list">
            <li>In Increlution, press F1 to open the Automations screen</li>
            <li>Click Export to copy the JSON</li>
            <li>In the editor, press Ctrl+V anywhere on the loadout page</li>
          </ol>
        </section>

        <section className="help-section">
          <h3>Organizing</h3>
          <ul className="help-list">
            <li>Create folders to organize your loadouts</li>
            <li>Drag and drop loadouts and folders to reorganize</li>
            <li>Click on a folder name to edit it inline</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Sharing</h3>
          <ul className="help-list">
            <li>Click "Share" on any loadout to create a shareable link</li>
            <li>Choose expiration and whether to show your name</li>
            <li>Others can view your loadout read-only via the link</li>
            <li>Logged-in viewers can save it to "Others' Loadouts"</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Chapter Progress</h3>
          <p className="help-text">
            Chapters 2-11 are locked by default to prevent spoilers. Unlock them in
            Settings by entering the name of the first exploration in each chapter.
          </p>
        </section>
      </div>
    </div>
  );
}
