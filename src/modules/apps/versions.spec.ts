import { describe, expect, it } from 'vitest';
import { compareVersions, VERSION_PATTERN } from './versions';

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('accepts only major.minor.patch', () => {
    expect(VERSION_PATTERN.test('1.2.3')).toBe(true);
    expect(VERSION_PATTERN.test('1.2')).toBe(false);
    expect(VERSION_PATTERN.test('1.2.3-beta')).toBe(false);
  });
});
