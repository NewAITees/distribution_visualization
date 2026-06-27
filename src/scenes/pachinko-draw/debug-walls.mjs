import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './physics-core.js';

await RAPIER.init({});

const sim = createPachinkoDrawWorld(RAPIER, { population: 1, successIds: new Set() });

// Drop just 10 steps to see initial state
for (let i = 0; i < 10; i++) sim.step(1 / 60);

const ball = sim.balls[0];
const p = ball.rb.translation();
console.log(`After 10 steps: ball pos=(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);

// Count rigid bodies in world
let rbCount = 0;
sim.world.forEachRigidBody(() => rbCount++);
console.log(`Rigid bodies in world: ${rbCount}`);

let colCount = 0;
sim.world.forEachCollider(col => {
  colCount++;
  const rb = col.parent();
  const t = rb ? rb.translation() : { x: '?', y: '?', z: '?' };
  console.log(`  collider: type=${rb?.bodyType?.()}, pos=(${typeof t.x === 'number' ? t.x.toFixed(2) : t.x}, ${typeof t.y === 'number' ? t.y.toFixed(2) : t.y}, ${typeof t.z === 'number' ? t.z.toFixed(2) : t.z}), sensor=${col.isSensor()}`);
});
console.log(`Total colliders: ${colCount}`);
