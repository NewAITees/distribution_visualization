/**
 * Run many trials to find jam conditions.
 * Reports trials where not all balls exit within time limit.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './physics-core.js';

await RAPIER.init({});

const MAX_STEPS = 6000; // 100 seconds
const TRIALS = 20;

for (const POPULATION of [20, 36, 50]) {
  let jams = 0;
  let maxStep = 0;

  for (let t = 0; t < TRIALS; t++) {
    const successIds = new Set(Array.from({ length: Math.floor(POPULATION / 3) }, (_, i) => i + 1));
    const sim = createPachinkoDrawWorld(RAPIER, { population: POPULATION, successIds });

    let exited = 0;
    let lastExitStep = 0;

    for (let step = 0; step < MAX_STEPS; step++) {
      const exits = sim.step(1 / 60);
      if (exits.length > 0) {
        exited += exits.length;
        lastExitStep = step;
      }
      if (exited >= POPULATION) break;
      if (lastExitStep > 0 && step - lastExitStep > 1800) break; // 30s no exit = stuck
    }

    if (exited < POPULATION) {
      jams++;
      const stuck = sim.balls.filter(b => !b.removed);
      const positions = stuck.map(b => {
        const p = b.rb.translation();
        const v = b.rb.linvel();
        const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
        return `(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) spd=${speed.toFixed(2)}`;
      });
      console.log(`pop=${POPULATION} trial=${t}: JAM exited=${exited}/${POPULATION} last_exit=${lastExitStep}`);
      positions.forEach(s => console.log(`  ${s}`));
    } else {
      maxStep = Math.max(maxStep, lastExitStep);
    }
  }

  console.log(`pop=${POPULATION}: jam_rate=${jams}/${TRIALS}, max_ok_step=${maxStep}\n`);
}
