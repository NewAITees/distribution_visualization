import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './physics-core.js';

await RAPIER.init({});

const sim = createPachinkoDrawWorld(RAPIER, { population: 1, successIds: new Set() });

// Check CCD status
const ball = sim.balls[0];
console.log('enableCcd available:', typeof ball.rb.enableCcd === 'function');
console.log('isCcdEnabled:', typeof ball.rb.isCcdEnabled === 'function' ? ball.rb.isCcdEnabled() : 'no method');

// Check collider size
let i = 0;
sim.world.forEachCollider(col => {
  if (col.isSensor()) return;
  const shape = col.shape;
  const rb = col.parent();
  if (!rb) return;
  const t = rb.translation();
  // Try to get half extents
  const he = shape.halfExtents;
  if (he) {
    console.log(`collider[${i}]: center=(${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}) half=(${he.x.toFixed(3)},${he.y.toFixed(3)},${he.z.toFixed(3)})`);
  }
  i++;
});
