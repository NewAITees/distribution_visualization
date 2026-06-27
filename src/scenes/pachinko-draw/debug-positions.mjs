import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './physics-core.js';

await RAPIER.init({});

const sim = createPachinkoDrawWorld(RAPIER, { population: 5, successIds: new Set([1, 2]) });

for (let i = 0; i < 3600; i++) sim.step(1 / 60);

console.log('Ball positions after 60s:');
for (const ball of sim.balls) {
  if (ball.removed) {
    console.log(`  ball ${ball.id}: removed (exited)`);
    continue;
  }
  const p = ball.rb.translation();
  const v = ball.rb.linvel();
  console.log(`  ball ${ball.id}: pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) vel_y=${v.y.toFixed(2)}`);
}
