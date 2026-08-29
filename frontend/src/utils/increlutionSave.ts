/*
 * Client-side decoder for Increlution save files.
 *
 * Increlution encrypts saves with OpenSSL-compatible AES-256-CBC: the plaintext
 * is a base64 blob of `Salted__` + 8-byte salt + ciphertext, with key/IV derived
 * via EVP_BytesToKey (MD5, 1 iteration). The password below is embedded in the
 * game client itself, so it is public knowledge and safe to ship here — there is
 * no secret to leak. Decoding happens entirely in the browser; a save never
 * leaves the user's machine.
 *
 * We decrypt with the exact CryptoJS build the game bundles (see ../vendor), which
 * guarantees byte-compatibility and avoids the KDF-default drift between CryptoJS
 * versions.
 */
import CryptoJS from '../vendor/cryptojs-aes-3.1.2.js';

const SAVE_PASSWORD = 'gXVgN';

/**
 * Hourglass "funnels": optional, hard, skippable explorations whose
 * `timesCompleted` counts how many times the player has funnelled each
 * artifact's power. Order matches the original badge (hourglass/shield/tooth/core).
 */
export const FUNNELS = [
  { key: 'hourglass', name: 'Hourglass', explorationId: 161 },
  { key: 'shield', name: 'Shield', explorationId: 190 },
  { key: 'tooth', name: 'Tooth', explorationId: 228 },
  { key: 'core', name: 'Titan Core', explorationId: 304 },
] as const;

/** Skill order as stored in the save's `skills` array. */
export const SKILL_NAMES = [
  'Farming',
  'Woodcutting',
  'Construction',
  'Agility',
  'Fishing',
  'Cooking',
  'Digging',
  'Combat',
  'Hunting',
  'Sailing',
  'Social',
  'Hourglass',
] as const;

interface RawSkill {
  instinctLevel: number | string;
  generationLevel?: number | string;
  currentMultiplier?: number | string;
}

interface RawChapterEntry {
  tickClock: number | string;
  generation: number | string;
}

interface RawChapterCompletions {
  best?: (RawChapterEntry | null)[];
  last?: (RawChapterEntry | null)[];
  current?: (RawChapterEntry | null)[];
}

interface RawNewGamePlus {
  dna?: number | string;
  perks?: (number | string)[];
  penalties?: (number | string)[];
}

interface RawStats {
  longestLife?: number | string;
  highestExploration?: number | string;
  chapterCompletions?: RawChapterCompletions;
}

interface RawExploration {
  timesCompleted?: number | string;
}

/** Only the fields the badge consumes are declared; saves contain much more. */
export interface IncrelutionSave {
  generation?: number | string;
  tickClock?: number | string;
  maxHealth?: number | string;
  dna?: number | string;
  skills?: RawSkill[];
  exploration?: RawExploration[];
  newGamePlus?: RawNewGamePlus | null;
  stats?: RawStats;
  saveUpdateVersion?: number | string;
}

export class IncrelutionSaveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IncrelutionSaveError';
  }
}

/**
 * Decode a raw Increlution save string (as exported by the game or found in a
 * backup .txt) into a parsed object. Throws {@link IncrelutionSaveError} with a
 * human-readable message on any failure.
 */
export function decodeSave(raw: string): IncrelutionSave {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new IncrelutionSaveError('The save is empty. Paste an Increlution save or choose a save file.');
  }

  // The game's saves are base64 of an OpenSSL "Salted__" header. Catch obvious
  // non-save input early for a friendlier message than a crypto failure.
  if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    throw new IncrelutionSaveError('This does not look like an Increlution save (expected base64 text).');
  }

  let plaintext: string;
  try {
    plaintext = CryptoJS.AES.decrypt(trimmed, SAVE_PASSWORD).toString(CryptoJS.enc.Utf8);
  } catch (cause) {
    throw new IncrelutionSaveError('Could not decrypt this save — it may be corrupt or not an Increlution save.', { cause });
  }

  if (!plaintext) {
    throw new IncrelutionSaveError('Could not decrypt this save — it may be corrupt or not an Increlution save.');
  }

  try {
    return JSON.parse(plaintext) as IncrelutionSave;
  } catch (cause) {
    throw new IncrelutionSaveError('Decrypted the save but its contents were not valid JSON.', { cause });
  }
}

function toNum(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const NUMBER_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * Compact number notation (e.g. 667K, 2.40M, 15.1T) — three significant figures
 * with a magnitude suffix, matching the original badge's tight formatting.
 */
export function formatShortNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const neg = value < 0;
  let n = Math.abs(value);
  if (n < 1000) {
    const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return (neg ? '-' : '') + s;
  }
  let tier = 0;
  while (n >= 1000 && tier < NUMBER_SUFFIXES.length - 1) {
    n /= 1000;
    tier += 1;
  }
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return (neg ? '-' : '') + s + NUMBER_SUFFIXES[tier];
}

/**
 * Format a tick count (milliseconds of game time) as a compact duration,
 * e.g. "2d 22h 35m 34s". Zero-valued units are omitted, matching the game.
 * When the duration is under a day, milliseconds are included too, so short
 * (e.g. speedrun) completion times keep their precision instead of collapsing
 * to whole seconds (or "0s").
 */
export function formatDuration(ms: number): string {
  const totalMs = Math.floor(Math.max(0, ms));
  const days = Math.floor(totalMs / 86_400_000);
  const hours = Math.floor((totalMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);
  if (days === 0 && millis) parts.push(`${millis}ms`);
  return parts.length ? parts.join(' ') : '0s';
}

/**
 * The game's automation-unlock requirement: 0.999^dna, i.e. a compounding 0.1%
 * reduction per New Game+ DNA. Returned as a percentage string (e.g. "6.38%").
 */
export function formatUnlockRequirement(dna: number): string {
  const fraction = Math.pow(0.999, Math.max(0, dna)) * 100;
  return `${fraction >= 10 ? fraction.toFixed(1) : fraction.toFixed(2)}%`;
}

/**
 * Format a tick count (ms) as a clock, dropping a leading zero hours component:
 * "44:53" under an hour, "1:02:03" over. Used for the "longest life" figure.
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export interface BadgeSkill {
  name: string;
  instinctLevel: number;
}

export interface BadgeChapter {
  chapter: number;
  timeMs: number;
  generation: number;
}

export interface BadgeFunnel {
  key: string;
  name: string;
  count: number;
}

export interface BadgeModel {
  generation: number;
  maxHealth: number;
  dna: number;
  totalTimeMs: number;
  longestLifeMs: number;
  highestExploration: number;
  perks: number[];
  funnels: BadgeFunnel[];
  skills: BadgeSkill[];
  chapters: BadgeChapter[];
}

/**
 * Reduce a decoded save to the view model the badge renders. Chapter times come
 * from the player's best completions (falling back to last, then current).
 */
export function buildBadgeModel(save: IncrelutionSave): BadgeModel {
  const stats = save.stats ?? {};
  const completions = stats.chapterCompletions ?? {};
  // `current` is this playthrough's progress; `best`/`last` span all New Game+
  // playthroughs, which would over-report chapters not completed this run.
  const source = completions.current ?? completions.last ?? completions.best ?? [];

  const chapters: BadgeChapter[] = [];
  source.forEach((entry, index) => {
    // Index 0 is always null (there is no "chapter 0"); chapter N lives at index N.
    if (!entry || index === 0) return;
    chapters.push({
      chapter: index,
      timeMs: toNum(entry.tickClock),
      generation: toNum(entry.generation),
    });
  });

  const skills: BadgeSkill[] = (save.skills ?? []).map((skill, index) => ({
    name: SKILL_NAMES[index] ?? `Skill ${index + 1}`,
    instinctLevel: toNum(skill.instinctLevel),
  }));

  const perks = (save.newGamePlus?.perks ?? []).map(toNum);

  const exploration = save.exploration ?? [];
  const funnels: BadgeFunnel[] = FUNNELS.map((funnel) => ({
    key: funnel.key,
    name: funnel.name,
    count: toNum(exploration[funnel.explorationId]?.timesCompleted),
  }));

  return {
    generation: toNum(save.generation),
    maxHealth: toNum(save.maxHealth),
    // New Game+ DNA (carried across playthroughs), not the in-run automation
    // currency at top-level `dna`.
    dna: toNum(save.newGamePlus?.dna),
    totalTimeMs: toNum(save.tickClock),
    longestLifeMs: toNum(stats.longestLife),
    highestExploration: toNum(stats.highestExploration),
    perks,
    funnels,
    skills,
    chapters,
  };
}
