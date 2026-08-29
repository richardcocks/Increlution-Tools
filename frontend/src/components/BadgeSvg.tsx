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
  chapter: '#e0a24a', // warm accent for chapter numbers, as in the original
} as const;

// A plain sans stack, close to the original badge and consistent when rasterised.
const FONT = 'Arial, Helvetica, sans-serif';
const W = 580;

// Skill icons, in the save's skill order. The game uses Font Awesome Pro glyphs;
// these are the closest Font Awesome Free equivalents.
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
  const leftW = 196;
  const rightX = 216;
  const rightW = W - rightX - 12; // 352

  const topY = 12;
  const topH = 94;
  const botY = topY + topH + 10; // 116

  const rowH = 17;
  const hasPerks = model.perks.length > 0;
  const hasFunnels = model.funnels.some((f) => f.count > 0);

  // Both bottom boxes share a baseline grid: row 0 is the chapter header, and
  // skills / chapters fill rows from there. The taller of the two sets height.
  const maxRows = Math.max(model.skills.length, 1 + model.chapters.length);
  const botBoxH = 14 + maxRows * rowH + 8;
  const H = Math.round(botY + botBoxH + 24);
  const rowBaseline = (r: number) => botY + 24 + r * rowH;

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
      <Icon name="heart" x={leftX + 14} y={topY + 16} size={22} color={C.icon} />
      <text x={leftX + 44} y={topY + 35} fontFamily={FONT} fontSize={22} fontWeight={700} fill={C.value}>
        {formatShortNumber(model.maxHealth)}
      </text>
      {hasFunnels &&
        model.funnels.map((funnel, i) => {
          const x = leftX + 14 + i * 45;
          return (
            <g key={funnel.key}>
              <Icon name={FUNNEL_ICONS[funnel.key]} x={x} y={topY + 62} size={14} color={C.icon} />
              <text x={x + 18} y={topY + 74} fontFamily={FONT} fontSize={12} fontWeight={600} fill={C.value}>
                {funnel.count}
              </text>
            </g>
          );
        })}

      {/* ---- Top-right box: New Game+ (flask), perks, DNA + unlock requirement ---- */}
      <rect x={rightX} y={topY} width={rightW} height={topH} rx={6} fill={C.card} stroke={C.stroke} />
      <Icon name="flask" x={rightX + 12} y={topY + 30} size={30} color={C.icon} />
      <text x={rightX + 56} y={topY + 24} fontFamily={FONT} fontSize={11} fill={C.muted}>
        New Game+ Perks
      </text>
      <text x={rightX + 56} y={topY + 44} fontFamily={FONT} fontSize={13} fontWeight={600} fill={C.text}>
        {hasPerks ? model.perks.join('  ·  ') : '—'}
      </text>
      <Icon name="dna" x={rightX + 56} y={topY + 62} size={14} color={C.icon} />
      <text x={rightX + 78} y={topY + 74} fontFamily={FONT} fontSize={15} fontWeight={700} fill={C.value}>
        {formatShortNumber(model.dna)}
      </text>
      <Icon name="lock" x={rightX + 170} y={topY + 62} size={13} color={C.muted} />
      <text x={rightX + 190} y={topY + 74} fontFamily={FONT} fontSize={13} fill={C.muted}>
        {formatUnlockRequirement(model.dna)}
      </text>

      {/* ---- Bottom-left box: skill instincts (icon + level) ---- */}
      <rect x={leftX} y={botY} width={leftW} height={botBoxH} rx={6} fill={C.card} stroke={C.stroke} />
      {model.skills.map((skill, i) => {
        const baseline = rowBaseline(i);
        return (
          <g key={skill.name}>
            <Icon name={SKILL_ICONS[i]} x={leftX + 14} y={baseline - 11} size={13} color={C.icon} />
            <text
              x={leftX + leftW - 14}
              y={baseline}
              fontFamily={FONT}
              fontSize={13}
              fontWeight={600}
              fill={C.value}
              textAnchor="end"
            >
              {skill.instinctLevel}
            </text>
          </g>
        );
      })}

      {/* ---- Bottom-right box: run summary header + chapter completions ---- */}
      <rect x={rightX} y={botY} width={rightW} height={botBoxH} rx={6} fill={C.card} stroke={C.stroke} />
      {/* Header row: total time, generation, exploration, best life */}
      <Icon name="clock" x={rightX + 12} y={rowBaseline(0) - 11} size={12} color={C.icon} />
      <text x={rightX + 28} y={rowBaseline(0)} fontFamily={FONT} fontSize={12} fontWeight={600} fill={C.text}>
        {formatDuration(model.totalTimeMs)}
      </text>
      <Icon name="user" x={rightX + 154} y={rowBaseline(0) - 11} size={12} color={C.icon} />
      <text x={rightX + 170} y={rowBaseline(0)} fontFamily={FONT} fontSize={12} fill={C.text}>
        {model.generation}
      </text>
      <Icon name="explored" x={rightX + 208} y={rowBaseline(0) - 11} size={12} color={C.icon} />
      <text x={rightX + 226} y={rowBaseline(0)} fontFamily={FONT} fontSize={12} fill={C.text}>
        {model.highestExploration}
      </text>
      <Icon name="heartPulse" x={rightX + 268} y={rowBaseline(0) - 11} size={12} color={C.icon} />
      <text x={rightX + 284} y={rowBaseline(0)} fontFamily={FONT} fontSize={12} fill={C.text}>
        {formatClock(model.longestLifeMs)}
      </text>
      <line
        x1={rightX + 12}
        y1={rowBaseline(0) + 7}
        x2={rightX + rightW - 12}
        y2={rowBaseline(0) + 7}
        stroke={C.stroke}
      />
      {model.chapters.map((chapter, i) => {
        const baseline = rowBaseline(i + 1);
        return (
          <g key={chapter.chapter}>
            <Icon name="book" x={rightX + 12} y={baseline - 11} size={12} color={C.muted} />
            <text x={rightX + 30} y={baseline} fontFamily={FONT} fontSize={12} fontWeight={700} fill={C.chapter}>
              {chapter.chapter}
            </text>
            <text x={rightX + 56} y={baseline} fontFamily={FONT} fontSize={11} fill={C.text}>
              {formatDuration(chapter.timeMs)}
            </text>
            <text
              x={rightX + rightW - 14}
              y={baseline}
              fontFamily={FONT}
              fontSize={12}
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
