import { describe, expect, it } from 'vitest';
import {
  JOIN_CODE_ALPHABET,
  generateJoinCode,
  isValidJoinCode,
  joinLink,
  normalizeJoinCode,
} from './joinCode';

describe('join codes', () => {
  it('has no look-alike characters', () => {
    for (const c of '01OIL') expect(JOIN_CODE_ALPHABET).not.toContain(c);
    expect(JOIN_CODE_ALPHABET).toHaveLength(31);
  });

  it('validates the spec example and rejects look-alikes', () => {
    expect(isValidJoinCode('K72QX')).toBe(true);
    expect(isValidJoinCode('K72Q0')).toBe(false);
    expect(isValidJoinCode('K72Q')).toBe(false);
    expect(isValidJoinCode('k72qx')).toBe(false);
  });

  it('normalizes typed input', () => {
    expect(normalizeJoinCode(' k72 qx ')).toBe('K72QX');
  });

  it('generates valid codes from the random source', () => {
    let i = 0;
    const code = generateJoinCode((n) => i++ % n);
    expect(code).toBe('23456');
    expect(isValidJoinCode(generateJoinCode((n) => Math.floor(Math.random() * n)))).toBe(true);
  });

  it('builds the share link', () => {
    expect(joinLink('K72QX')).toBe('https://qualk.dk/play?code=K72QX');
  });
});
