import { describe, it, expect } from 'vitest';
import { gateOf } from './clearance';

describe('gateOf', () => {
  it('maps a section and its sub-pages to one gate', () => {
    expect(gateOf('/station')).toBe('/station');
    expect(gateOf('/station/readme')).toBe('/station');
    expect(gateOf('/')).toBeNull();
    expect(gateOf('/information')).toBeNull();
  });
});
