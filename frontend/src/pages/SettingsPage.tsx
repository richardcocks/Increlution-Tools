import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGameData } from '../contexts/GameDataContext';
import type { ThemePreference } from '../types/settings';
import { useToast } from '../components/Toast';
import type { AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { makeSkillActionKey } from '../types/settings';
import AutomationWheel from '../components/AutomationWheel';
import './SettingsPage.css';

const ACTION_TYPES = [
  { type: ActionType.Jobs, label: 'Jobs' },
  { type: ActionType.Construction, label: 'Construction' },
  { type: ActionType.Exploration, label: 'Exploration' },
];

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { settings, loading: settingsLoading, updateSettings, unlockedChaptersSet, unlockChapter } = useSettings();
  const { themePreference, setThemePreference } = useTheme();
  const { skills, loading: skillsLoading } = useGameData();
  const { showToast } = useToast();

  // Chapter unlock form state
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [explorationGuess, setExplorationGuess] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockSuccess, setUnlockSuccess] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Get list of locked chapters (1-10, since 0 is always unlocked)
  const lockedChapters = useMemo(() => {
    const locked: number[] = [];
    for (let i = 1; i <= 10; i++) {
      if (!unlockedChaptersSet.has(i)) {
        locked.push(i);
      }
    }
    return locked;
  }, [unlockedChaptersSet]);

  // Auto-select first locked chapter if none selected
  useEffect(() => {
    if (selectedChapter === null && lockedChapters.length > 0) {
      setSelectedChapter(lockedChapters[0]);
    } else if (selectedChapter !== null && unlockedChaptersSet.has(selectedChapter)) {
      // Current selection was unlocked, select next locked chapter
      setSelectedChapter(lockedChapters.length > 0 ? lockedChapters[0] : null);
    }
  }, [lockedChapters, selectedChapter, unlockedChaptersSet]);

  const handleUnlockAttempt = async () => {
    if (selectedChapter === null || !explorationGuess.trim() || isUnlocking) return;

    setUnlockError(null);
    setUnlockSuccess(null);
    setIsUnlocking(true);

    try {
      const result = await unlockChapter(selectedChapter, explorationGuess.trim());

      if (result.success) {
        setUnlockSuccess(result.message);
        setExplorationGuess('');
      } else {
        setUnlockError(result.message);
      }
    } catch {
      setUnlockError('Failed to unlock chapter');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Migrate old format settings (numeric keys) to new format (skillId-actionType keys)
  // and initialize defaults for new users
  useEffect(() => {
    if (skillsLoading || settingsLoading) return;

    const skillIds = Object.keys(skills);
    if (skillIds.length === 0) return;

    // Check if we have old-format settings (keys without "-" are old numeric format)
    const existingKeys = Object.keys(settings.defaultSkillPriorities);
    const hasOldFormat = existingKeys.length > 0 && existingKeys.some(key => !key.includes('-'));

    if (hasOldFormat || !settings.skillPrioritiesInitialized) {
      // Clear old format and initialize with new format
      const defaultPriorities: Record<string, number> = {};
      skillIds.forEach(id => {
        ACTION_TYPES.forEach(({ type }) => {
          defaultPriorities[makeSkillActionKey(Number(id), type)] = 2;
        });
      });
      updateSettings({ defaultSkillPriorities: defaultPriorities, skillPrioritiesInitialized: true });
    }
  }, [skills, skillsLoading, settingsLoading, settings.skillPrioritiesInitialized, settings.defaultSkillPriorities, updateSettings]);

  const handleInvertMouseChange = async (value: boolean) => {
    try {
      await updateSettings({ invertMouse: value });
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleApplyDefaultsOnImportChange = async (value: boolean) => {
    try {
      await updateSettings({ applyDefaultsOnImport: value });
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  const handlePriorityChange = async (skillId: number, actionType: number, level: number | null) => {
    const key = makeSkillActionKey(skillId, actionType);
    const newPriorities = { ...settings.defaultSkillPriorities };
    if (level === null) {
      delete newPriorities[key];
    } else {
      newPriorities[key] = level;
    }
    try {
      await updateSettings({ defaultSkillPriorities: newPriorities });
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleSetAll = async (level: number) => {
    const newPriorities: Record<string, number> = {};
    Object.keys(skills).forEach(id => {
      ACTION_TYPES.forEach(({ type }) => {
        newPriorities[makeSkillActionKey(Number(id), type)] = level;
      });
    });
    try {
      await updateSettings({ defaultSkillPriorities: newPriorities });
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleClearAll = async () => {
    try {
      await updateSettings({ defaultSkillPriorities: {}, skillPrioritiesInitialized: true });
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleCellClick = (e: React.MouseEvent, skillId: number, actionType: number) => {
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      const key = makeSkillActionKey(skillId, actionType);
      const currentValue = settings.defaultSkillPriorities[key];
      handlePriorityChange(skillId, actionType, currentValue === undefined ? 2 : null);
    }
  };

  if (skillsLoading || settingsLoading) {
    return (
      <div className="settings-page">
        <div className="settings-header">
          <div className="settings-header-content">
            <button className="back-button" onClick={onClose}>
              <i className="fas fa-arrow-left" />
              Back
            </button>
            <h2>Settings</h2>
          </div>
        </div>
        <div className="settings-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const sortedSkills = Object.values(skills).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div className="settings-header-content">
          <button className="back-button" onClick={onClose}>
            <i className="fas fa-arrow-left" />
            Back
          </button>
          <h2>Settings</h2>
        </div>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <h3>Chapter Progress</h3>
          <p className="section-description">
            Unlock chapters by entering the name of the first exploration in that chapter.
            This prevents spoilers for content you haven't discovered yet in the game.
          </p>

          <div className="chapter-progress">
            {[...Array(11)].map((_, i) => (
              <div
                key={i}
                className={`chapter-badge ${unlockedChaptersSet.has(i) ? 'unlocked' : 'locked'}`}
                title={unlockedChaptersSet.has(i) ? `Chapter ${i + 1} unlocked` : `Chapter ${i + 1} locked`}
              >
                {i + 1}
                {unlockedChaptersSet.has(i) && <i className="fas fa-check" />}
              </div>
            ))}
          </div>

          {lockedChapters.length > 0 ? (
            <div className="unlock-form">
              <div className="unlock-chapter-select">
                <label htmlFor="chapter-select">Unlock Chapter:</label>
                <select
                  id="chapter-select"
                  value={selectedChapter ?? ''}
                  onChange={(e) => {
                    setSelectedChapter(Number(e.target.value));
                    setUnlockError(null);
                    setUnlockSuccess(null);
                  }}
                >
                  {lockedChapters.map(ch => (
                    <option key={ch} value={ch}>Chapter {ch + 1}</option>
                  ))}
                </select>
              </div>
              <div className="unlock-input-row">
                <input
                  type="text"
                  placeholder="Enter the first exploration name..."
                  value={explorationGuess}
                  onChange={(e) => {
                    setExplorationGuess(e.target.value);
                    setUnlockError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlockAttempt()}
                  disabled={isUnlocking}
                />
                <button
                  onClick={handleUnlockAttempt}
                  disabled={!explorationGuess.trim() || isUnlocking}
                >
                  {isUnlocking ? 'Unlocking...' : 'Unlock'}
                </button>
              </div>
              {unlockError && <p className="unlock-error">{unlockError}</p>}
              {unlockSuccess && <p className="unlock-success">{unlockSuccess}</p>}
            </div>
          ) : (
            <p className="all-unlocked">All chapters unlocked!</p>
          )}
        </section>

        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="theme-select-group">
            <label htmlFor="theme-select">Theme:</label>
            <select
              id="theme-select"
              value={themePreference}
              onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
              className="theme-select"
            >
              <option value="system">System (follow device setting)</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h3>Mouse Behavior</h3>
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={settings.invertMouse}
              onChange={e => handleInvertMouseChange(e.target.checked)}
            />
            <span className="checkbox-label">
              Invert mouse (right-click increases, click decreases)
            </span>
          </label>
        </section>

        <section className="settings-section">
          <h3>Default Skill Priorities</h3>
          <p className="section-description">
            Set default priorities for each skill by action type. These will be applied for new loadouts and optionally when importing loadouts.
            <br />
            <strong>Ctrl+click</strong> on a cell to toggle enable/disable. <strong>Ctrl+click</strong> on the wheel for min/max.
          </p>
          <div className="quick-actions">
            <button onClick={handleClearAll} className="quick-action-btn">Clear All</button>
            <button onClick={() => handleSetAll(0)} className="quick-action-btn">All Off</button>
            <button onClick={() => handleSetAll(1)} className="quick-action-btn">All Low</button>
            <button onClick={() => handleSetAll(2)} className="quick-action-btn">All Regular</button>
            <button onClick={() => handleSetAll(3)} className="quick-action-btn">All High</button>
            <button onClick={() => handleSetAll(4)} className="quick-action-btn">All Top</button>
          </div>

          <div className="skills-table">
            <div className="skills-table-header">
              <div className="skill-name-header">Skill</div>
              {ACTION_TYPES.map(({ type, label }) => (
                <div key={type} className="action-type-header">
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="skills-table-body">
              {sortedSkills.map(skill => (
                <div key={skill.id} className="skill-row">
                  <div className="skill-info">
                    <i className={skill.icon} />
                    <span className="skill-name">{skill.name}</span>
                  </div>
                  {ACTION_TYPES.map(({ type }) => {
                    const key = makeSkillActionKey(skill.id, type);
                    const priority = settings.defaultSkillPriorities[key];
                    const isUnset = priority === undefined;
                    return (
                      <div
                        key={type}
                        className={`skill-cell ${isUnset ? 'skill-cell-unset' : ''}`}
                        onClick={(e) => handleCellClick(e, skill.id, type)}
                      >
                        {isUnset ? (
                          <i className="fas fa-minus-circle skill-unset-icon" title="No default set (Ctrl+click to enable)" />
                        ) : (
                          <AutomationWheel
                            level={priority as AutomationLevel}
                            onChange={(level) => handlePriorityChange(skill.id, type, level)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Paste from Game Behavior</h3>
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={settings.applyDefaultsOnImport}
              onChange={e => handleApplyDefaultsOnImportChange(e.target.checked)}
            />
            <span className="checkbox-label">
              Apply default priorities to unset values when pasting from Increlution
            </span>
          </label>
        </section>

        <section className="settings-section danger-zone">
          <h3>Danger Zone</h3>
          <div className="danger-zone-content">
            <div className="danger-zone-info">
              <p className="danger-zone-title">Delete Account</p>
              <p className="danger-zone-description">
                Permanently delete your account and all associated data.
                This action cannot be undone.
              </p>
            </div>
            <button
              className="delete-account-button"
              onClick={() => navigate('/delete-account')}
            >
              Delete Account
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
