import { forwardRef } from 'react';
import { formatShortNumber, formatDuration, formatClock, formatUnlockRequirement } from '../utils/increlutionSave';
import type { BadgeModel } from '../utils/increlutionSave';
import { ICONS } from './badgeIcons';
import type { IconName } from './badgeIcons';

// Fixed near-black palette (matching the original badge) so the SVG — and any
// PNG exported from it — looks identical regardless of the viewer's app theme.
const C = {
  bg: '#0e0e12',
  card: '#191920',
  stroke: 'rgba(255, 255, 255, 0.16)',
  text: '#ececf0',
  muted: '#9b9ba6',
  value: '#ffffff',
  icon: '#d7d7e0',
} as const;

// Labels use a plain sans; all numeric values use a monospace stack (as the
// original badge did) so digits line up cleanly. Both rasterise consistently.
const FONT = 'Arial, Helvetica, sans-serif';
const MONO = "'Consolas', 'DejaVu Sans Mono', 'Roboto Mono', 'Courier New', monospace";
const NUM_SPACING = 0.5;
const W = 552;

// Skill icons, in the save's skill order — matching backend/GameData/skills.json.
const SKILL_ICONS: IconName[] = [
  'farming',
  'woodcutting',
  'construction',
  'agility',
  'fishing',
  'cooking',
  'digging',
  'combat',
  'hunting',
  'sailing',
  'social',
  'hourglass',
];

// Maps a funnel's key (from the save model) to its icon.
const FUNNEL_ICONS: Record<string, IconName> = {
  hourglass: 'hourglass',
  shield: 'shield',
  tooth: 'tooth',
  core: 'core',
};

interface IconProps {
  name: IconName;
  x: number;
  /** Top of the icon box. */
  y: number;
  size: number;
  color: string;
}

/** Renders an icon path scaled to `size` (tall) and horizontally centred in a `size`-wide slot. */
function Icon({ name, x, y, size, color }: IconProps) {
  const icon = ICONS[name];
  const scale = size / icon.h;
  const dx = x + (size - icon.w * scale) / 2;
  return (
    <g transform={`translate(${dx}, ${y}) scale(${scale})`}>
      <path d={icon.d} fill={color} />
    </g>
  );
}

interface BadgeSvgProps {
  model: BadgeModel;
}

export const BadgeSvg = forwardRef<SVGSVGElement, BadgeSvgProps>(function BadgeSvg({ model }, ref) {
  const leftX = 12;
  const leftW = 184;
  const rightX = 208;
  const rightW = W - rightX - 12; // 332

  const topY = 12;
  const topH = 96;
  const botY = topY + topH + 10;

  const rowH = 20;
  const hasPerks = model.perks.length > 0;
  const hasFunnels = model.funnels.some((f) => f.count > 0);

  // Both bottom boxes share a baseline grid: row 0 is the chapter header, and
  // skills / chapters fill rows from there. The taller of the two sets height.
  const maxRows = Math.max(model.skills.length, 1 + model.chapters.length);
  const botBoxH = 16 + maxRows * rowH + 8;
  const H = Math.round(botY + botBoxH + 24);
  const rowBaseline = (r: number) => botY + 26 + r * rowH;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`Increlution stats badge: generation ${model.generation}, ${model.chapters.length} chapters completed`}
    >
      <rect x={0} y={0} width={W} height={H} fill={C.bg} />

      {/* ---- Top-left box: max HP + funnels ---- */}
      <rect x={leftX} y={topY} width={leftW} height={topH} rx={6} fill={C.card} stroke={C.stroke} />
      <Icon name="heart" x={leftX + 14} y={topY + 17} size={22} color={C.icon} />
      <text
        x={leftX + 44}
        y={topY + 36}
        fontFamily={MONO}
        fontSize={22}
        fontWeight={700}
        letterSpacing={NUM_SPACING}
        fill={C.value}
      >
        {formatShortNumber(model.maxHealth)}
      </text>
      {hasFunnels &&
        model.funnels.map((funnel, i) => {
          const x = leftX + 14 + i * 42;
          return (
            <g key={funnel.key}>
              <Icon name={FUNNEL_ICONS[funnel.key]} x={x} y={topY + 64} size={14} color={C.icon} />
              <text
                x={x + 20}
                y={topY + 76}
                fontFamily={MONO}
                fontSize={12}
                fontWeight={600}
                letterSpacing={NUM_SPACING}
                fill={C.value}
              >
                {funnel.count}
              </text>
            </g>
          );
        })}

      {/* ---- Top-right box: New Game+ (flask), perks, DNA + unlock req + exploration ---- */}
      <rect x={rightX} y={topY} width={rightW} height={topH} rx={6} fill={C.card} stroke={C.stroke} />
      <Icon name="flask" x={rightX + 12} y={topY + 32} size={30} color={C.icon} />
      <text x={rightX + 56} y={topY + 25} fontFamily={FONT} fontSize={11} fill={C.muted}>
        New Game+ Perks
      </text>
      {model.ngPlusRuns ? (
        <text
          x={rightX + rightW - 14}
          y={topY + 25}
          textAnchor="end"
          fontFamily={FONT}
          fontSize={11}
          fill={C.muted}
        >
          NG+: {model.ngPlusRuns}
        </text>
      ) : null}
      <text
        x={rightX + 56}
        y={topY + 46}
        fontFamily={MONO}
        fontSize={13}
        fontWeight={600}
        letterSpacing={1}
        fill={C.text}
      >
        {hasPerks ? model.perks.join(' ') : '—'}
      </text>
      <Icon name="dna" x={rightX + 56} y={topY + 64} size={14} color={C.icon} />
      <text
        x={rightX + 80}
        y={topY + 76}
        fontFamily={MONO}
        fontSize={15}
        fontWeight={700}
        letterSpacing={NUM_SPACING}
        fill={C.value}
      >
        {formatShortNumber(model.dna)}
      </text>
      <Icon name="lock" x={rightX + 160} y={topY + 64} size={13} color={C.muted} />
      <text x={rightX + 180} y={topY + 76} fontFamily={MONO} fontSize={13} letterSpacing={NUM_SPACING} fill={C.muted}>
        {formatUnlockRequirement(model.dna)}
      </text>
      <Icon name="explored" x={rightX + 258} y={topY + 64} size={13} color={C.icon} />
      <text x={rightX + 278} y={topY + 76} fontFamily={MONO} fontSize={13} letterSpacing={NUM_SPACING} fill={C.value}>
        {model.highestExploration}
      </text>

      {/* ---- Bottom-left box: skill instincts (icon + level, grouped left) ---- */}
      <rect x={leftX} y={botY} width={leftW} height={botBoxH} rx={6} fill={C.card} stroke={C.stroke} />
      {model.skills.map((skill, i) => {
        const baseline = rowBaseline(i);
        return (
          <g key={skill.name}>
            <Icon name={SKILL_ICONS[i]} x={leftX + 18} y={baseline - 12} size={14} color={C.icon} />
            <text
              x={leftX + 44}
              y={baseline}
              fontFamily={MONO}
              fontSize={13}
              fontWeight={600}
              letterSpacing={NUM_SPACING}
              fill={C.value}
            >
              {skill.instinctLevel}
            </text>
          </g>
        );
      })}

      {/* ---- Bottom-right box: run summary header + chapter completions ---- */}
      <rect x={rightX} y={botY} width={rightW} height={botBoxH} rx={6} fill={C.card} stroke={C.stroke} />
      {/* Header row: total time, generation, best life */}
      <Icon name="clock" x={rightX + 12} y={rowBaseline(0) - 12} size={13} color={C.icon} />
      <text
        x={rightX + 30}
        y={rowBaseline(0)}
        fontFamily={MONO}
        fontSize={12}
        fontWeight={600}
        letterSpacing={NUM_SPACING}
        fill={C.text}
      >
        {formatDuration(model.totalTimeMs)}
      </text>
      <Icon name="user" x={rightX + 164} y={rowBaseline(0) - 12} size={13} color={C.icon} />
      <text x={rightX + 182} y={rowBaseline(0)} fontFamily={MONO} fontSize={12} letterSpacing={NUM_SPACING} fill={C.text}>
        {model.generation}
      </text>
      <Icon name="heartPulse" x={rightX + 244} y={rowBaseline(0) - 12} size={13} color={C.icon} />
      <text x={rightX + 262} y={rowBaseline(0)} fontFamily={MONO} fontSize={12} letterSpacing={NUM_SPACING} fill={C.text}>
        {formatClock(model.longestLifeMs)}
      </text>
      <line
        x1={rightX + 12}
        y1={rowBaseline(0) + 8}
        x2={rightX + rightW - 12}
        y2={rowBaseline(0) + 8}
        stroke={C.stroke}
      />
      {model.chapters.map((chapter, i) => {
        const baseline = rowBaseline(i + 1);
        return (
          <g key={chapter.chapter}>
            <Icon name="book" x={rightX + 12} y={baseline - 12} size={12} color={C.muted} />
            <text
              x={rightX + 32}
              y={baseline}
              fontFamily={MONO}
              fontSize={12}
              fontWeight={700}
              letterSpacing={NUM_SPACING}
              fill={C.value}
            >
              {chapter.chapter}
            </text>
            <text
              x={rightX + 58}
              y={baseline}
              fontFamily={MONO}
              fontSize={11}
              letterSpacing={NUM_SPACING}
              fill={C.text}
            >
              {formatDuration(chapter.timeMs)}
            </text>
            <text
              x={rightX + rightW - 14}
              y={baseline}
              fontFamily={MONO}
              fontSize={12}
              letterSpacing={NUM_SPACING}
              fill={C.value}
              textAnchor="end"
            >
              {chapter.generation}
            </text>
          </g>
        );
      })}

      {/* Footer */}
      <text x={W - 14} y={H - 10} fontFamily={FONT} fontSize={10} fill={C.muted} textAnchor="end">
        automations.eterm.uk
      </text>
    </svg>
  );
});
