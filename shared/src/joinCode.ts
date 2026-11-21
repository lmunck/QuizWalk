/** Join codes: 5 characters, alphabet without 0/O/1/I/L (docs/v1-spec.md §6). */

export const JOIN_CODE_LENGTH = 5;
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const VALID = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

/** Uppercases and strips spaces, so typed or scanned input can be checked. */
export function normalizeJoinCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isValidJoinCode(code: string): boolean {
  return VALID.test(code);
}

/**
 * Random join code. `randomInt(n)` must return an integer in [0, n).
 * Pass a cryptographically secure source (e.g. `crypto.randomInt` in Cloud Functions).
 */
export function generateJoinCode(randomInt: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET.charAt(randomInt(JOIN_CODE_ALPHABET.length));
  }
  return code;
}

export function joinLink(code: string): string {
  return `https://qualk.dk/play?code=${encodeURIComponent(code)}`;
}
