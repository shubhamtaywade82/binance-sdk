import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('index', () => {
  it('exports a semver VERSION string (prerelease allowed, e.g. 3.0.0-next.1)', () => {
    // full semver: major.minor.patch with optional prerelease/build identifiers —
    // v3 develops as 3.0.0-next.x until the architecture release is stable.
    expect(VERSION).toMatch(
      /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
    );
  });
});
