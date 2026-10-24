import { describe, expect, it } from 'vitest';
import { diffContracts, hasDrift, releaseType } from '../../scripts/upstream-drift.js';
import type { EndpointContract } from '../../scripts/import-postman-collections.js';

function contract(method: EndpointContract['method'], path: string, params: Array<[string, boolean]> = []): EndpointContract {
  return {
    sourceCollection: 'Binance Spot API.json',
    sourceFolder: [],
    name: path,
    product: 'spot',
    hostKey: 'apiRoot',
    method,
    path,
    auth: 'public',
    queryParams: params.map(([name, required]) => ({ name, required })),
    bodyParams: [],
    docRef: path,
  };
}

describe('diffContracts', () => {
  it('should report no drift when contracts are identical', () => {
    const pinned = [contract('GET', '/api/v3/ping')];
    expect(hasDrift(diffContracts(pinned, [contract('GET', '/api/v3/ping')]))).toBe(false);
  });

  it('should report endpoints added and removed upstream', () => {
    const drift = diffContracts([contract('GET', '/api/v3/old')], [contract('GET', '/api/v3/new')]);
    expect(drift.added.map((c) => c.path)).toEqual(['/api/v3/new']);
    expect(drift.removed.map((c) => c.path)).toEqual(['/api/v3/old']);
  });

  it('should report a parameter removed or made required', () => {
    const pinned = [contract('GET', '/papi/v1/um/income', [['page', false]]), contract('GET', '/a', [['x', false]])];
    const latest = [contract('GET', '/papi/v1/um/income'), contract('GET', '/a', [['x', true]])];
    expect(diffContracts(pinned, latest).paramsChanged).toEqual(['GET /a', 'GET /papi/v1/um/income']);
  });

  it('should ignore parameter order', () => {
    const pinned = [contract('GET', '/a', [['x', false], ['y', true]])];
    const latest = [contract('GET', '/a', [['y', true], ['x', false]])];
    expect(hasDrift(diffContracts(pinned, latest))).toBe(false);
  });
});

describe('releaseType', () => {
  it('should be feat when endpoints are added or removed', () => {
    expect(releaseType(diffContracts([contract('GET', '/a')], [contract('GET', '/b')]))).toBe('feat');
  });

  it('should be fix when only parameters changed', () => {
    const pinned = [contract('GET', '/a', [['page', false]])];
    expect(releaseType(diffContracts(pinned, [contract('GET', '/a')]))).toBe('fix');
  });
});
