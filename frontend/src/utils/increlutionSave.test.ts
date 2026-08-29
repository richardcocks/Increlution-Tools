import { describe, it, expect } from 'vitest';
import CryptoJS from '../vendor/cryptojs-aes-3.1.2.js';
import {
  decodeSave,
  buildBadgeModel,
  formatShortNumber,
  formatDuration,
  formatClock,
  formatUnlockRequirement,
  estimateNgPlusRuns,
  IncrelutionSaveError,
  SKILL_NAMES,
} from './increlutionSave';

// The game encrypts saves with this (public, client-embedded) password. We build
// synthetic saves the same way the game does — encrypting JSON with the vendored
// CryptoJS build — so the decoder is exercised end-to-end against a real-format
// ciphertext, without committing a real player save.
const SAVE_PASSWORD = 'gXVgN';
const encodeSave = (data: unknown): string => CryptoJS.AES.encrypt(JSON.stringify(data), SAVE_PASSWORD).toString();

const SKILL_LEVELS = [993, 980, 906, 981, 974, 960, 941, 991, 997, 891, 922, 24];
const CHAPTER_GENERATIONS = [10, 31, 49, 78, 101, 120, 149, 183, 203, 248, 281];
const chapterEntries = (count: number) =>
  CHAPTER_GENERATIONS.slice(0, count).map((generation, i) => ({ tickClock: (i + 1) * 1_000_000, generation }));

const exploration = Array.from({ length: 305 }, () => ({ timesCompleted: 0 }));
exploration[161] = { timesCompleted: 7 }; // Funnel hourglass
exploration[190] = { timesCompleted: 8 }; // Funnel shield
// 228 (tooth) and 304 (titan core) stay at 0

const sampleSave = encodeSave({
  generation: 162,
  tickClock: 312_069_868,
  maxHealth: '667278',
  skills: SKILL_LEVELS.map((instinctLevel) => ({ instinctLevel: String(instinctLevel) })),
  exploration,
  newGamePlus: { dna: '440', perks: ['3', '3', '0', '0', '1', '1', '1', '0', '2', '1'], penalties: [] },
  stats: {
    longestLife: 2_693_580,
    highestExploration: 216,
    chapterCompletions: {
      current: [null, ...chapterEntries(7)], // this playthrough: chapters 1-7
      last: [null, ...chapterEntries(11)],
      best: [null, ...chapterEntries(11)],
    },
  },
});

describe('decodeSave', () => {
  it('decodes a save produced in the game format into a parsed object', () => {
    const save = decodeSave(sampleSave);
    expect(save.skills).toHaveLength(SKILL_NAMES.length);
    expect(save.generation).toBe(162);
    expect(save.stats?.chapterCompletions?.best).toBeTruthy();
  });

  it('tolerates surrounding whitespace', () => {
    expect(() => decodeSave(`\n  ${sampleSave}  \n`)).not.toThrow();
  });

  it('rejects an empty save', () => {
    expect(() => decodeSave('   ')).toThrow(IncrelutionSaveError);
  });

  it('rejects non-base64 input before attempting decryption', () => {
    expect(() => decodeSave('this is clearly not a save!!!')).toThrow(/base64/);
  });

  it('rejects valid base64 that is not a real save', () => {
    // "hello world" base64 — decrypts to garbage / fails the Salted__ path.
    expect(() => decodeSave('aGVsbG8gd29ybGQ=')).toThrow(IncrelutionSaveError);
  });
});

describe('buildBadgeModel', () => {
  const model = buildBadgeModel(decodeSave(sampleSave));

  it('extracts the headline stats', () => {
    expect(model.generation).toBe(162);
    expect(model.maxHealth).toBe(667278);
    expect(model.highestExploration).toBe(216);
    expect(model.totalTimeMs).toBeGreaterThan(0);
  });

  it('uses New Game+ DNA, not the in-run automation currency', () => {
    expect(model.dna).toBe(440);
  });

  it('maps all 12 skills with names in order', () => {
    expect(model.skills).toHaveLength(12);
    expect(model.skills[0]).toEqual({ name: 'Farming', instinctLevel: 993 });
    expect(model.skills[11].name).toBe('Hourglass');
  });

  it('builds the chapter table from this run (current), indexed by chapter', () => {
    // current has chapters 1-7, even though best/last span all 11.
    expect(model.chapters.length).toBe(7);
    expect(model.chapters[0].chapter).toBe(1);
    expect(model.chapters[model.chapters.length - 1].chapter).toBe(7);
    for (const chapter of model.chapters) {
      expect(chapter.chapter).toBeGreaterThanOrEqual(1);
      expect(chapter.generation).toBeGreaterThan(0);
      expect(chapter.timeMs).toBeGreaterThan(0);
    }
  });

  it('reads new game+ perks', () => {
    expect(model.perks).toEqual([3, 3, 0, 0, 1, 1, 1, 0, 2, 1]);
  });

  it('reads funnel counts from the funnel explorations timesCompleted', () => {
    // explorations 161/190/228/304 -> hourglass/shield/tooth/core
    expect(model.funnels.map((f) => [f.name, f.count])).toEqual([
      ['Hourglass', 7],
      ['Shield', 8],
      ['Tooth', 0],
      ['Titan Core', 0],
    ]);
  });

  it('derives the New Game+ run count from DNA', () => {
    expect(model.ngPlusRuns).toBe(4); // 440 / 110
  });
});

describe('formatShortNumber', () => {
  it('formats magnitudes compactly', () => {
    expect(formatShortNumber(667278)).toBe('667K');
    expect(formatShortNumber(2_400_000)).toBe('2.40M');
    expect(formatShortNumber(15_100_000_000_000)).toBe('15.1T');
    expect(formatShortNumber(999)).toBe('999');
  });
});

describe('formatDuration', () => {
  it('formats ms as a compact duration, omitting zero units', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    // 2 days, 0 hours, 33 minutes, 27 seconds — the zero hours unit is dropped.
    expect(formatDuration((2 * 86400 + 33 * 60 + 27) * 1000)).toBe('2d 33m 27s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('includes milliseconds when there are no days', () => {
    expect(formatDuration(273)).toBe('273ms');
    expect(formatDuration(3273)).toBe('3s 273ms');
    // With days present, milliseconds are dropped to stay compact.
    expect(formatDuration(86_400_000 + 273)).toBe('1d');
  });
});

describe('estimateNgPlusRuns', () => {
  it('divides evenly by 110 for full-completion runs', () => {
    expect(estimateNgPlusRuns(440)).toBe(4);
    expect(estimateNgPlusRuns(110)).toBe(1);
    expect(estimateNgPlusRuns(0)).toBe(0);
  });

  it('mixes 90- and 110-DNA runs (fewest 90s) when 110 does not divide evenly', () => {
    expect(estimateNgPlusRuns(200)).toBe(2); // 90 + 110
    expect(estimateNgPlusRuns(420)).toBe(4); // 90 + 3*110
    expect(estimateNgPlusRuns(180)).toBe(2); // 2*90
  });

  it('returns null when no whole-run combination fits', () => {
    expect(estimateNgPlusRuns(100)).toBeNull();
  });
});

describe('formatUnlockRequirement', () => {
  it('computes the automation unlock requirement as 0.999^dna', () => {
    expect(formatUnlockRequirement(2750)).toBe('6.38%'); // matches the original badge
    expect(formatUnlockRequirement(440)).toBe('64.4%');
    expect(formatUnlockRequirement(0)).toBe('100.0%');
  });
});

describe('formatClock', () => {
  it('drops leading zero hours', () => {
    expect(formatClock(2_693_580)).toBe('44:53');
    expect(formatClock(3_723_000)).toBe('1:02:03');
  });
});
