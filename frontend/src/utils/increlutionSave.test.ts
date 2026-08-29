import { describe, it, expect } from 'vitest';
import exampleSave from './__fixtures__/exampleSave.txt?raw';
import {
  decodeSave,
  buildBadgeModel,
  formatShortNumber,
  formatDuration,
  formatClock,
  IncrelutionSaveError,
  SKILL_NAMES,
} from './increlutionSave';

describe('decodeSave', () => {
  it('decodes a real Increlution save into a parsed object', () => {
    const save = decodeSave(exampleSave);
    expect(save.skills).toHaveLength(SKILL_NAMES.length);
    expect(save.generation).toBe(162);
    expect(save.stats?.chapterCompletions?.best).toBeTruthy();
  });

  it('tolerates surrounding whitespace', () => {
    expect(() => decodeSave(`\n  ${exampleSave}  \n`)).not.toThrow();
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
  const model = buildBadgeModel(decodeSave(exampleSave));

  it('extracts the headline stats', () => {
    expect(model.generation).toBe(162);
    expect(model.maxHealth).toBe(667278);
    expect(model.highestExploration).toBe(216);
    expect(model.totalTimeMs).toBeGreaterThan(0);
  });

  it('uses New Game+ DNA, not the in-run automation currency', () => {
    // save.dna is ~32.8M (automation currency); newGamePlus.dna is 440.
    expect(model.dna).toBe(440);
  });

  it('maps all 12 skills with names in order', () => {
    expect(model.skills).toHaveLength(12);
    expect(model.skills[0]).toEqual({ name: 'Farming', instinctLevel: 993 });
    expect(model.skills[11].name).toBe('Hourglass');
  });

  it('builds the chapter table from this run (current), indexed by chapter', () => {
    // The sample save has completed chapters 1-7 this playthrough (current),
    // even though best/last span all 11 across playthroughs.
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
});

describe('formatShortNumber', () => {
  it('formats magnitudes like the game', () => {
    expect(formatShortNumber(667278)).toBe('667 K');
    expect(formatShortNumber(2_400_000)).toBe('2.40 M');
    expect(formatShortNumber(15_100_000_000_000)).toBe('15.1 T');
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
});

describe('formatClock', () => {
  it('drops leading zero hours', () => {
    expect(formatClock(2_693_580)).toBe('44:53');
    expect(formatClock(3_723_000)).toBe('1:02:03');
  });
});
