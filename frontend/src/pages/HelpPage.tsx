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
              <span className="shortcut-desc">Toggle exclude (excluded actions are not changed when importing into the game)</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + Click (tab)</span>
              <span className="shortcut-desc">Bulk exclude/include all actions in that chapter</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + V</span>
              <span className="shortcut-desc">Paste loadout data exported from Increlution</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Middle-click (sidebar)</span>
              <span className="shortcut-desc">Quick copy loadout data (to paste into Increlution)</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + Z</span>
              <span className="shortcut-desc">Undo last change to loadout data</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + Y / Ctrl + Shift + Z</span>
              <span className="shortcut-desc">Redo last undone change</span>
            </div>
          </div>
        </section>

        <section className="help-section">
          <h3>Copy to Increlution</h3>
          <ol className="help-list">
            <li>Create a new loadout using the sidebar or folder view</li>
            <li>Click on the automation wheel next to each action to set its level</li>
            <li>Click "Copy for Game" to copy the loadout data</li>
            <li>In Increlution, press F1 to open Automations and click Import</li>
          </ol>
        </section>

        <section className="help-section">
          <h3>Paste from Increlution</h3>
          <ol className="help-list">
            <li>In Increlution, press F1 to open the Automations screen</li>
            <li>Click Export to copy the JSON</li>
            <li>In the Loadout Manager, press Ctrl+V anywhere on the loadout page</li>
          </ol>
        </section>

        <section className="help-section">
          <h3>Organizing</h3>
          <ul className="help-list">
            <li>Click a folder in the sidebar to view and manage it</li>
            <li>Create new folders and loadouts from the folder view</li>
            <li>Drag and drop items in the sidebar to reorganize</li>
            <li>Click on a folder or loadout name to rename it inline</li>
            <li>Use Duplicate to copy a loadout or entire folder structure</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Deleting</h3>
          <ul className="help-list">
            <li>Delete buttons are in the folder view and loadout header</li>
            <li>Non-empty folders require typing the folder name to confirm</li>
            <li>Protected (readonly) loadouts are moved to the parent folder instead of deleted</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Sharing</h3>
          <ul className="help-list">
            <li>Click "Share" on any loadout or folder to create a shareable link</li>
            <li>Folder shares include all subfolders and loadouts recursively</li>
            <li>Choose expiration and whether to show your name</li>
            <li>Others can view your shared content read-only via the link</li>
            <li>Logged-in viewers can save shares to "Others' Loadouts"</li>
            <li>Shared items show live data (your changes are reflected)</li>
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
