import { describe, expect, it } from 'vitest';
import { nextMotionSetting, parseMotionSetting, resolveReducedMotion } from './motion';

describe('motion preference', () => {
  it('parses stored settings defensively', () => {
    expect(parseMotionSetting('reduce')).toBe('reduce');
    expect(parseMotionSetting('full')).toBe('full');
    expect(parseMotionSetting('garbage')).toBe('system');
    expect(parseMotionSetting(null)).toBe('system');
  });

  it('follows the operating system unless the visitor overrides it', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('reduce', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });

  it('cycles system → reduce → full → system', () => {
    expect(nextMotionSetting('system')).toBe('reduce');
    expect(nextMotionSetting('reduce')).toBe('full');
    expect(nextMotionSetting('full')).toBe('system');
  });
});
