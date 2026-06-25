import { createSpinnerWorld, BALL_RADIUS } from './physics-core.js';

const rapierModule = await import('../../../node_modules/@dimforge/rapier3d-compat/rapier.mjs');
const RAPIER = rapierModule.default ?? rapierModule;
await RAPIER.init({});

export { BALL_RADIUS };

/**
 * Create bingo spinner physics for the browser.
 * Thin wrapper that passes RAPIER into the shared core.
 */
export function createBingoPhysics({ population, successIds, dt } = {}) {
  return createSpinnerWorld(RAPIER, { population, successIds, dt });
}
