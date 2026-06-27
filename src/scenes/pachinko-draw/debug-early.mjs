import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './physics-core.js';

await RAPIER.init({});

const sim = createPachinkoDrawWorld(RAPIER, { population: 1, successIds: new Set() });

// Track ball position every 60 steps (1 second intervals)
for (let step = 0; step <= 600; step++) {
  if (step % 60 === 0) {
    const ball = sim.balls[0];
    if (ball.removed) { console.log(`step=${step}: ball exited`); break; }
    const p = ball.rb.translation();
    const v = ball.rb.linvel();
    console.log(`step=${step.toString().padStart(4)}: pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) vel_y=${v.y.toFixed(2)}`);
    if (p.y < -10) { console.log('  → ball fell through floor!'); break; }
  }
  sim.step(1 / 60);
}
