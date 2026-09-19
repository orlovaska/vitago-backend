import { describe, expect, it } from 'vitest';
import { SETTING_KEYS, SETTINGS } from './settings.catalog';

describe('settings catalog', () => {
  it.each(SETTING_KEYS)('%s has a default that passes its own schema', (key) => {
    expect(SETTINGS[key].schema.safeParse(SETTINGS[key].default).success).toBe(true);
  });

  it('never lets clients poll faster than once a second', () => {
    const schema = SETTINGS['payments.clientPollIntervalMs'].schema;
    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse(500).success).toBe(false);
    expect(schema.safeParse(-1).success).toBe(false);
    expect(schema.safeParse('5000').success).toBe(false);
  });
});
