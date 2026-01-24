import { memo, useCallback } from 'react';
import type { AutomationLevel } from '../types/models';
import { AutomationLevel as AutomationLevelConst } from '../types/models';
import { useSettings } from '../contexts/SettingsContext';
import './AutomationWheel.css';

interface AutomationWheelProps {
  level: AutomationLevel;
  onChange: (level: AutomationLevel) => void;
}

const LEVELS = [
  { value: AutomationLevelConst.Off, label: 'Off', angle: -90 },
  { value: AutomationLevelConst.Low, label: 'Low', angle: -45 },
  { value: AutomationLevelConst.Regular, label: 'Reg', angle: 0 },
  { value: AutomationLevelConst.High, label: 'High', angle: 45 },
  { value: AutomationLevelConst.Top, label: 'Top', angle: 90 },
];

const AutomationWheel = memo(function AutomationWheel({ level, onChange }: AutomationWheelProps) {
  const { settings } = useSettings();
  const effectiveValue = level ?? 0;
  const currentLevel = LEVELS.find(l => l.value === effectiveValue) ?? LEVELS[0];
  const currentIndex = LEVELS.findIndex(l => l.value === effectiveValue);
  const effectiveIndex = currentIndex === -1 ? 0 : currentIndex;

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Stop propagation so row doesn't handle Ctrl+click for lock toggle
    e.stopPropagation();

    if (e.ctrlKey) {
      // Ctrl+click = max (Top), Ctrl+right-click = min (Off)
      onChange(settings.invertMouse ? LEVELS[0].value : LEVELS[LEVELS.length - 1].value);
    } else {
      // Normal click: increase or decrease based on invert setting
      const nextIndex = settings.invertMouse
        ? (effectiveIndex - 1 + LEVELS.length) % LEVELS.length
        : (effectiveIndex + 1) % LEVELS.length;
      onChange(LEVELS[nextIndex].value);
    }
  }, [effectiveIndex, onChange, settings.invertMouse]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Stop propagation so row doesn't handle this
    e.stopPropagation();

    if (e.ctrlKey) {
      // Ctrl+right-click = min (Off)
      onChange(settings.invertMouse ? LEVELS[LEVELS.length - 1].value : LEVELS[0].value);
    } else {
      // Normal right-click: decrease or increase based on invert setting
      const nextIndex = settings.invertMouse
        ? (effectiveIndex + 1) % LEVELS.length
        : (effectiveIndex - 1 + LEVELS.length) % LEVELS.length;
      onChange(LEVELS[nextIndex].value);
    }
  }, [effectiveIndex, onChange, settings.invertMouse]);

  return (
    <div
      className={`automation-wheel level-${currentLevel.value}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={`${currentLevel.label} (click/right-click to cycle, Ctrl+click for max/min)`}
    >
      <svg viewBox="0 0 40 24" className="wheel-svg">
        {/* Gauge arc background */}
        <path
          d="M 4 20 A 16 16 0 0 1 36 20"
          fill="none"
          stroke="var(--wheel-track)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {LEVELS.map((level, i) => {
          const radians = (level.angle - 90) * (Math.PI / 180);
          const innerR = 12;
          const outerR = 16;
          const cx = 20;
          const cy = 20;
          const x1 = cx + innerR * Math.cos(radians);
          const y1 = cy + innerR * Math.sin(radians);
          const x2 = cx + outerR * Math.cos(radians);
          const y2 = cy + outerR * Math.sin(radians);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--wheel-tick)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Needle */}
        <g
          transform={`rotate(${currentLevel.angle}, 20, 20)`}
          className="wheel-needle"
        >
          <line
            x1="20"
            y1="20"
            x2="20"
            y2="6"
            stroke="var(--wheel-needle)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="20"
            cy="20"
            r="3"
            fill="var(--wheel-needle)"
          />
        </g>
      </svg>
    </div>
  );
});

export default AutomationWheel;
