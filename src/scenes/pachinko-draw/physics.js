import { createPachinkoDrawWorld, BALL_RADIUS } from './physics-core.js';

const rapierModule = await import('../../../node_modules/@dimforge/rapier3d-compat/rapier_wasm3d.js');
await rapierModule.init();
const RAPIER = rapierModule;

export { BALL_RADIUS };

/**
 * Create pachinko-draw physics for the browser.
 * Thin wrapper that passes RAPIER into the shared core.
 */
export function createPachinkoDrawPhysics({ population, successIds, dt } = {}) {
  return createPachinkoDrawWorld(RAPIER, { population, successIds, dt });
}
