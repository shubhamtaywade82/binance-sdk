import { ENDPOINT_REGISTRY, endpointCounts } from '../dist/index.js';
console.log('Total endpoints:', ENDPOINT_REGISTRY.length);
console.log('Per-product counts:');
for (const [k, v] of Object.entries(endpointCounts())) {
  console.log('  ', k, '=', v);
}
