import { memo, useCallback } from 'react';
import type { IncrelutionAction, AutomationLevel, Skill } from '../types/models';
import AutomationWheel from './AutomationWheel';

interface ActionRowProps {
  action: IncrelutionAction;
  skill?: Skill;
  automationLevel: AutomationLevel;
  onAutomationChange: (action: IncrelutionAction, level: AutomationLevel) => void;
  onToggleLock: (action: IncrelutionAction) => void;
  isFaded?: boolean;
}

const ActionRow = memo(function ActionRow({ action, skill, automationLevel, onAutomationChange, onToggleLock, isFaded = false }: ActionRowProps) {
  const icon = skill?.icon || 'fa-question';
  const isNull = automationLevel === null;

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      onToggleLock(action);
    }
  }, [action, onToggleLock]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, []);

  const handleAutomationChange = useCallback((level: AutomationLevel) => {
    onAutomationChange(action, level);
  }, [action, onAutomationChange]);

  return (
    <div
      className={`action-row ${isNull ? 'action-row-null' : ''} ${isFaded ? 'action-row-faded' : ''}`}
      onClick={handleRowClick}
      onMouseDown={handleMouseDown}
    >
      <div className="action-info">
        <i className={`fas ${icon} action-icon`}></i>
        <span className="action-name">{action.name}</span>
      </div>
      {isNull ? (
        <i className="fas fa-ban action-excluded-icon" title="Excluded from loadout (Ctrl+click to include)" />
      ) : (
        <AutomationWheel
          level={automationLevel}
          onChange={handleAutomationChange}
        />
      )}
    </div>
  );
});

export default ActionRow;
