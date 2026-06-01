import { describe, it, expect } from 'vitest';
import { extractMeProfile } from './me.js';

describe('extractMeProfile', () => {
  it('parses the normalized {data, included} shape', () => {
    const me = {
      data: { '*miniProfile': 'urn:li:fs_miniProfile:ACoAAB12345' },
      included: [
        {
          entityUrn: 'urn:li:fs_miniProfile:ACoAAB12345',
          firstName: 'Ada',
          lastName: 'Lovelace',
          publicIdentifier: 'ada',
        },
      ],
    };
    const out = extractMeProfile(me);
    expect(out.urnId).toBe('ACoAAB12345');
    expect(out.name).toBe('Ada Lovelace');
    expect(out.entityUrn).toBe('urn:li:fs_miniProfile:ACoAAB12345');
  });

  it('parses a flat entityUrn shape', () => {
    const out = extractMeProfile({
      entityUrn: 'urn:li:fs_miniProfile:XYZ',
      firstName: 'Grace',
      lastName: 'Hopper',
    });
    expect(out.urnId).toBe('XYZ');
    expect(out.name).toBe('Grace Hopper');
  });

  it('parses a nested miniProfile shape', () => {
    const out = extractMeProfile({ miniProfile: { entityUrn: 'urn:li:fs_miniProfile:NEST' } });
    expect(out.urnId).toBe('NEST');
  });

  it('returns empty for unrecognized or null input', () => {
    expect(extractMeProfile(null)).toEqual({});
    expect(extractMeProfile({ foo: 'bar' }).urnId).toBeUndefined();
  });
});
