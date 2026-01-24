import { memo } from 'react';
import type { IncrelutionAction, AutomationLevel, Skill } from '../types/models';
import ActionRow from './ActionRow';

interface ChapterGroupProps {
  actions: IncrelutionAction[];
  skills: Record<number, Skill>;
  getAutomationLevel: (action: IncrelutionAction) => AutomationLevel;
  onAutomationChange: (action: IncrelutionAction, level: AutomationLevel) => void;
  onToggleLock: (action: IncrelutionAction) => void;
  matchingActionIds: Set<number> | null;
  hideNonMatching: boolean;
}

const ChapterGroup = memo(function ChapterGroup({ actions, skills, getAutomationLevel, onAutomationChange, onToggleLock, matchingActionIds, hideNonMatching }: ChapterGroupProps) {
  return (
    <div className="chapter-group">
      <div className="actions-list">
        {actions.map((action) => {
          const isNonMatching = matchingActionIds !== null && !matchingActionIds.has(action.id);

          // In hide mode, skip non-matching actions entirely
          if (hideNonMatching && isNonMatching) {
            return null;
          }

          return (
            <ActionRow
              key={action.id}
              action={action}
              skill={skills[action.skillId]}
              automationLevel={getAutomationLevel(action)}
              onAutomationChange={onAutomationChange}
              onToggleLock={onToggleLock}
              isFaded={!hideNonMatching && isNonMatching}
            />
          );
        })}
      </div>
    </div>
  );
});

export default ChapterGroup;
