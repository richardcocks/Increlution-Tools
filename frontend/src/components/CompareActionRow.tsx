import { memo } from 'react';
import type { IncrelutionAction, AutomationLevel, Skill } from '../types/models';
import AutomationWheel from './AutomationWheel';
import { COMPARE_COLORS } from '../utils/compareLoadouts';

interface CompareActionRowProps {
  action: IncrelutionAction;
  skill?: Skill;
  leftLoadout: { name: string; level: AutomationLevel };
  rightLoadout: { name: string; level: AutomationLevel };
  isFaded?: boolean;
}

const CompareActionRow = memo(function CompareActionRow({
  action,
  skill,
  leftLoadout,
  rightLoadout,
  isFaded = false
}: CompareActionRowProps) {
  const icon = skill?.icon || 'fa-question';
  const leftIsNull = leftLoadout.level === null;
  const rightIsNull = rightLoadout.level === null;

  return (
    <div className={`compare-action-row ${isFaded ? 'compare-action-row-faded' : ''}`}>
      <div className="compare-action-info">
        <i className={`fas ${icon} action-icon`}></i>
        <span className="action-name">{action.name}</span>
      </div>
      <div className="compare-wheels">
        <div className="compare-wheel-wrapper">
          {leftIsNull ? (
            <i className="fas fa-ban compare-ban-icon" title={`${leftLoadout.name}: Excluded`} />
          ) : (
            <AutomationWheel
              level={leftLoadout.level}
              readOnly
              loadoutName={leftLoadout.name}
            />
          )}
          <div className="compare-color-bar" style={{ backgroundColor: COMPARE_COLORS.left }} />
        </div>
        <div className="compare-wheel-wrapper">
          {rightIsNull ? (
            <i className="fas fa-ban compare-ban-icon" title={`${rightLoadout.name}: Excluded`} />
          ) : (
            <AutomationWheel
              level={rightLoadout.level}
              readOnly
              loadoutName={rightLoadout.name}
            />
          )}
          <div className="compare-color-bar" style={{ backgroundColor: COMPARE_COLORS.right }} />
        </div>
      </div>
    </div>
  );
});

export default CompareActionRow;
