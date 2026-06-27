/**
 * Backend physics verification for pachinko-draw.
 * Runs the full Rapier simulation in Node.js to check:
 *   - How many balls exit through the sensor
 *   - Whether exit count matches expected draws
 *
 * Usage: node src/scenes/pachinko-draw/verify-physics.mjs
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './physics-core.js';

await RAPIER.init({});

const POPULATION = 10;
const SUCCESS_COUNT = 3;
const MAX_STEPS = 6000;   // 100 seconds at 60fps
const DT = 1 / 60;

const successIds = new Set(Array.from({ length: SUCCESS_COUNT }, (_, i) => i + 1));

const sim = createPachinkoDrawWorld(RAPIER, {
  population: POPULATION,
  successIds,
  dt: DT,
});

let totalExits = 0;
let successExits = 0;
let step = 0;

console.log(`Running: population=${POPULATION}, successes=${SUCCESS_COUNT}, max_steps=${MAX_STEPS}`);

for (; step < MAX_STEPS; step++) {
  const exits = sim.step(DT);
  for (const ball of exits) {
    totalExits++;
    if (ball.success) successExits++;
    console.log(`  step=${step} EXIT ball.id=${ball.id} success=${ball.success}`);
  }
  if (totalExits >= POPULATION) break;
}

console.log('');
console.log(`Steps run: ${step}`);
console.log(`Balls exited: ${totalExits} / ${POPULATION}`);
console.log(`Success exits: ${successExits} / ${SUCCESS_COUNT}`);

if (totalExits === 0) {
  console.log('FAIL: no balls exited — funnel collision not working');
} else if (totalExits < POPULATION) {
  console.log(`WARN: only ${totalExits}/${POPULATION} balls exited after ${step} steps`);
} else {
  console.log('PASS: all balls exited');
}
