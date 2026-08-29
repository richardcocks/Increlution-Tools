import { forwardRef } from 'react';
import { formatShortNumber, formatDuration, formatClock } from '../utils/increlutionSave';
import type { BadgeModel } from '../utils/increlutionSave';
import { ICONS } from './badgeIcons';
import type { IconName } from './badgeIcons';

// Fixed dark palette so the SVG (and any PNG exported from it) looks identical
// regardless of the viewer's app theme — badges are shared out of context.
const C = {
  bg: '#171a26',
  card: '#232838',
  stroke: '#333a52',
  text: '#e8eaf2',
  muted: '#99a0b8',
  accent: '#7aa2f7',
  value: '#ffffff',
} as const;

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const W = 560;

// Skill icons, in the save's skill order. Game uses Font Awesome Pro glyphs;
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
  const chips: { icon: IconName; value: string }[] = [
    { icon: 'heart', value: formatShortNumber(model.maxHealth) },
    { icon: 'clock', value: formatDuration(model.totalTimeMs) },
    { icon: 'heartPulse', value: formatClock(model.longestLifeMs) },
    { icon: 'user', value: String(model.generation) },
    { icon: 'explored', value: String(model.highestExploration) },
    { icon: 'dna', value: formatShortNumber(model.dna) },
  ];

  const headerY = 12;
  const headerH = 92;
  const chipX0 = 26;
  const chipTop = 32;
  const chipRowH = 40;
  const cellW = (W - 2 * chipX0) / 3;

  const hasPerks = model.perks.length > 0;
  const hasFunnels = model.funnels.some((f) => f.count > 0);
  const metaTop = headerY + headerH + 6;
  const metaRowH = 22;
  const perksIconY = metaTop;
  const funnelsIconY = metaTop + (hasPerks ? metaRowH : 0);
  const metaRows = (hasPerks ? 1 : 0) + (hasFunnels ? 1 : 0);

  const panelTop = metaTop + metaRows * metaRowH + 8;
  const headingY = panelTop + 14;
  const dividerY = panelTop + 22;
  const rowsTop = panelTop + 42;
  const rowH = 18;

  const skillsBottom = rowsTop + model.skills.length * rowH;
  const chaptersBottom = rowsTop + (model.chapters.length + 1) * rowH;
  const contentBottom = Math.max(skillsBottom, chaptersBottom);
  const H = Math.round(contentBottom + 32);

  const leftX = 14;
  const leftW = 262;
  const rightX = 284;
  const rightW = 262;
  const panelH = contentBottom - (panelTop - 6) + 8;

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
      {/* Full-bleed opaque background: no rounded outer corners, so the exported
          PNG has no transparent (white-on-export) corners. The on-page preview is
          rounded via CSS border-radius instead. */}
      <rect x={0} y={0} width={W} height={H} fill={C.bg} />

      {/* Header card */}
      <rect x={leftX} y={headerY} width={W - 28} height={headerH} rx={8} fill={C.card} stroke={C.stroke} />
      {chips.map((chip, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = chipX0 + col * cellW;
        const baseline = chipTop + row * chipRowH + 13;
        return (
          <g key={chip.icon}>
            <Icon name={chip.icon} x={x} y={baseline - 15} size={18} color={C.accent} />
            <text x={x + 26} y={baseline} fontFamily={FONT} fontSize={17} fontWeight={700} fill={C.value}>
              {chip.value}
            </text>
          </g>
        );
      })}

      {/* New Game+ perks */}
      {hasPerks && (
        <>
          <Icon name="flask" x={leftX + 6} y={perksIconY} size={15} color={C.accent} />
          <text x={leftX + 28} y={perksIconY + 13} fontFamily={FONT} fontSize={12} fill={C.muted}>
            New Game+ Perks{'   '}
            <tspan fill={C.accent} fontWeight={600}>
              {model.perks.join('  ·  ')}
            </tspan>
          </text>
        </>
      )}

      {/* Hourglass funnels */}
      {hasFunnels && (
        <>
          <text x={leftX + 6} y={funnelsIconY + 13} fontFamily={FONT} fontSize={12} fill={C.muted}>
            Funnels
          </text>
          {model.funnels.map((funnel, i) => {
            const gx = leftX + 64 + i * 92;
            return (
              <g key={funnel.key}>
                <Icon name={FUNNEL_ICONS[funnel.key]} x={gx} y={funnelsIconY + 1} size={14} color={C.accent} />
                <text
                  x={gx + 20}
                  y={funnelsIconY + 13}
                  fontFamily={FONT}
                  fontSize={13}
                  fontWeight={600}
                  fill={C.value}
                >
                  {funnel.count}
                </text>
              </g>
            );
          })}
        </>
      )}

      {/* Panels */}
      <rect x={leftX} y={panelTop - 6} width={leftW} height={panelH} rx={8} fill={C.card} stroke={C.stroke} />
      <rect x={rightX} y={panelTop - 6} width={rightW} height={panelH} rx={8} fill={C.card} stroke={C.stroke} />

      {/* Skills panel */}
      <text x={leftX + 14} y={headingY} fontFamily={FONT} fontSize={13} fontWeight={700} fill={C.text}>
        Skill Instincts
      </text>
      <line x1={leftX + 12} y1={dividerY} x2={leftX + leftW - 12} y2={dividerY} stroke={C.stroke} />
      {model.skills.map((skill, i) => {
        const baseline = rowsTop + i * rowH + 12;
        return (
          <g key={skill.name}>
            <Icon name={SKILL_ICONS[i]} x={leftX + 14} y={baseline - 11} size={13} color={C.muted} />
            <text x={leftX + 34} y={baseline} fontFamily={FONT} fontSize={12} fill={C.muted}>
              {skill.name}
            </text>
            <text
              x={leftX + leftW - 14}
              y={baseline}
              fontFamily={FONT}
              fontSize={12}
              fontWeight={600}
              fill={C.value}
              textAnchor="end"
            >
              {skill.instinctLevel}
            </text>
          </g>
        );
      })}

      {/* Chapters panel */}
      <text x={rightX + 14} y={headingY} fontFamily={FONT} fontSize={13} fontWeight={700} fill={C.text}>
        Chapter Completions
      </text>
      <line x1={rightX + 12} y1={dividerY} x2={rightX + rightW - 12} y2={dividerY} stroke={C.stroke} />
      {/* Column headers */}
      <text x={rightX + 14} y={rowsTop + 12} fontFamily={FONT} fontSize={10} fill={C.muted}>
        CH
      </text>
      <text x={rightX + 54} y={rowsTop + 12} fontFamily={FONT} fontSize={10} fill={C.muted}>
        TIME
      </text>
      <Icon name="user" x={rightX + rightW - 24} y={rowsTop + 2} size={11} color={C.muted} />
      {model.chapters.map((chapter, i) => {
        const baseline = rowsTop + (i + 1) * rowH + 12;
        return (
          <g key={chapter.chapter}>
            <Icon name="book" x={rightX + 12} y={baseline - 11} size={12} color={C.accent} />
            <text x={rightX + 30} y={baseline} fontFamily={FONT} fontSize={12} fontWeight={600} fill={C.accent}>
              {chapter.chapter}
            </text>
            <text x={rightX + 54} y={baseline} fontFamily={FONT} fontSize={11} fill={C.text}>
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
      <text x={W - 16} y={H - 12} fontFamily={FONT} fontSize={10} fill={C.muted} textAnchor="end">
        automations.eterm.uk
      </text>
    </svg>
  );
});
