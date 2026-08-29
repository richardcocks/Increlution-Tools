import { forwardRef } from 'react';
import { formatShortNumber, formatDuration, formatClock } from '../utils/increlutionSave';
import type { BadgeModel } from '../utils/increlutionSave';

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

interface BadgeSvgProps {
  model: BadgeModel;
}

export const BadgeSvg = forwardRef<SVGSVGElement, BadgeSvgProps>(function BadgeSvg({ model }, ref) {
  const chips = [
    { label: 'Max HP', value: formatShortNumber(model.maxHealth) },
    { label: 'Total time', value: formatDuration(model.totalTimeMs) },
    { label: 'Best life', value: formatClock(model.longestLifeMs) },
    { label: 'Generation', value: String(model.generation) },
    { label: 'Explored', value: String(model.highestExploration) },
    { label: 'DNA', value: formatShortNumber(model.dna) },
  ];

  const chipAreaX = 20;
  const chipTop = 22;
  const cellW = (W - 40) / 3;
  const chipRowH = 44;

  const headerBottom = chipTop + 2 * chipRowH; // 110
  const hasPerks = model.perks.length > 0;
  const perksBaseline = headerBottom + 16;
  const panelTop = headerBottom + (hasPerks ? 34 : 10);

  const headingY = panelTop + 14;
  const dividerY = panelTop + 22;
  const rowsTop = panelTop + 42;
  const rowH = 17;

  const skillsBottom = rowsTop + model.skills.length * rowH;
  const chaptersBottom = rowsTop + (model.chapters.length + 1) * rowH;
  const contentBottom = Math.max(skillsBottom, chaptersBottom);
  const H = Math.round(contentBottom + 34);

  const leftX = 14;
  const leftW = 262;
  const rightX = 284;
  const rightW = 262;
  const panelH = contentBottom - panelTop + 14;

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
      <rect x={0} y={0} width={W} height={H} rx={12} fill={C.bg} />

      {/* Header card */}
      <rect x={leftX} y={12} width={W - 28} height={headerBottom - 6} rx={8} fill={C.card} stroke={C.stroke} />
      {chips.map((chip, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = chipAreaX + col * cellW + 12;
        const yLabel = chipTop + row * chipRowH + 14;
        return (
          <g key={chip.label}>
            <text x={x} y={yLabel} fontFamily={FONT} fontSize={11} fill={C.muted}>
              {chip.label}
            </text>
            <text x={x} y={yLabel + 20} fontFamily={FONT} fontSize={17} fontWeight={700} fill={C.value}>
              {chip.value}
            </text>
          </g>
        );
      })}

      {/* New Game+ perks */}
      {hasPerks && (
        <text x={chipAreaX} y={perksBaseline} fontFamily={FONT} fontSize={12} fill={C.muted}>
          New Game+ Perks{'   '}
          <tspan fill={C.accent} fontWeight={600}>
            {model.perks.join('  ·  ')}
          </tspan>
        </text>
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
        const y = rowsTop + i * rowH + 12;
        return (
          <g key={skill.name}>
            <text x={leftX + 14} y={y} fontFamily={FONT} fontSize={12} fill={C.muted}>
              {skill.name}
            </text>
            <text
              x={leftX + leftW - 14}
              y={y}
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
      <text x={rightX + 52} y={rowsTop + 12} fontFamily={FONT} fontSize={10} fill={C.muted}>
        TIME
      </text>
      <text x={rightX + rightW - 14} y={rowsTop + 12} fontFamily={FONT} fontSize={10} fill={C.muted} textAnchor="end">
        GEN
      </text>
      {model.chapters.map((chapter, i) => {
        const y = rowsTop + (i + 1) * rowH + 12;
        return (
          <g key={chapter.chapter}>
            <text x={rightX + 14} y={y} fontFamily={FONT} fontSize={12} fontWeight={600} fill={C.accent}>
              {chapter.chapter}
            </text>
            <text x={rightX + 52} y={y} fontFamily={FONT} fontSize={11} fill={C.text}>
              {formatDuration(chapter.timeMs)}
            </text>
            <text
              x={rightX + rightW - 14}
              y={y}
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
      <text x={W - 16} y={H - 14} fontFamily={FONT} fontSize={10} fill={C.muted} textAnchor="end">
        automations.eterm.uk
      </text>
    </svg>
  );
});
