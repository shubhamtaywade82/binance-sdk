export type { ProductId, ProductClient, ProductFactory } from './types.js';
export { isProductClient } from './types.js';
export { USDMClient } from './usdm/USDMClient.js';
export { buildUsdmSurface, type UsdmSurface, type FuturesNamespace } from './usdm/namespace.js';
export { SpotClient } from './spot/SpotClient.js';
export { buildSpotSurface, type SpotSurface } from './spot/surface.js';
export { CoinMClient } from './coinm/CoinMClient.js';
export { buildCoinmSurface, type CoinMSurface } from './coinm/surface.js';
