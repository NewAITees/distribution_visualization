/**
 * Headless physics test for the compound kinematic drum.
 * Mirrors the new buildDrum() logic from physics.js.
 * Run: node src/scenes/bingo-machine/simulate-drum.mjs
 */
/* global process */

import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init({});

const BALL_RADIUS  = 0.22;
const BALL_COUNT   = 36;
const MIX_FRAMES   = 120;        // 2 s mixing
const MAX_FRAMES   = 60 * 25;    // 25 s limit
const SPIN_SPEED   = 1.45;       // rad/s
const GATE_OPEN_Y  = -1.4;
const GATE_CLOSE_Y = 0.08;

// ── world ──────────────────────────────────────────────────────────────────────
function buildWorld(seed) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.numSolverIterations = 8;
  world.integrationParameters.numAdditionalFrictionIterations = 4;

  const ballMap = new Map();   // collider handle → ball id
  const balls   = [];

  function fixedBox(pos, size) {
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size[0]/2, size[1]/2, size[2]/2)
        .setFriction(0.8).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb
    );
    return rb;
  }

  // ── static chamber walls (same as physics.js) ──────────────────────────────
  const W = 2.75, H = 2.0, D = 1.75;
  fixedBox([-W,  H,  0], [0.18, H*2, D*2]);
  fixedBox([ W,  H,  0], [0.18, H*2, D*2]);
  fixedBox([ 0,  H, -D], [W*2,  H*2, 0.18]);
  fixedBox([ 0,  H,  D], [W*2,  H*2, 0.18]);
  fixedBox([ 0,  H*2.05, 0], [W*2, 0.18, D*2]);

  // floor with outlet hole
  fixedBox([-1.625, -0.05,  0   ], [2.75, 0.16, D*2]);
  fixedBox([ 1.625, -0.05,  0   ], [2.75, 0.16, D*2]);
  fixedBox([ 0,     -0.05, -1.15], [0.7,  0.16, 1.5]);
  fixedBox([ 0,     -0.05,  1.15], [0.7,  0.16, 1.5]);

  // gate (kinematic position-based, starts closed)
  const gateBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, GATE_CLOSE_Y, 0)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.35, 0.13, 0.5)
      .setFriction(1.0).setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    gateBody
  );

  // sensor below outlet
  const sensorRb  = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.55, 0));
  const sensorCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.35, 0.3, 0.5)
      .setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    sensorRb
  );
  const sensorHandle = sensorCol.handle;

  // ── compound kinematic drum (new design) ────────────────────────────────────
  const drumCenterY  = 1.8;
  const drumRadius   = 1.6;
  const drumHalfLen  = 1.5;
  const panelCount   = 8;
  const panelThick   = 0.14;
  const panelArcHalf = drumRadius * Math.sin(Math.PI / panelCount) * 1.15;

  const drumBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(0, drumCenterY, 0)
  );

  for (let i = 0; i < panelCount; i++) {
    if (i === 3 || i === 4) continue;   // 90° outlet gap at bottom
    const angle = (i / panelCount) * Math.PI * 2;
    const cy = Math.cos(angle) * drumRadius;
    const cz = Math.sin(angle) * drumRadius;
    const half = angle / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(drumHalfLen, panelThick/2, panelArcHalf)
        .setTranslation(0, cy, cz)
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) })
        .setFriction(0.9).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      drumBody
    );
  }

  // 4 internal ribs
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ribR  = drumRadius - 0.16;
    const cy    = Math.cos(angle) * ribR;
    const cz    = Math.sin(angle) * ribR;
    const half  = angle / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(drumHalfLen * 0.85, 0.16, 0.05)
        .setTranslation(0, cy, cz)
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) })
        .setFriction(0.9).setRestitution(0.03)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      drumBody
    );
  }

  // ── balls ──────────────────────────────────────────────────────────────────
  let rng = seed;
  function rand() {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff;
    return (rng >>> 0) / 0xffffffff;
  }

  for (let id = 1; id <= BALL_COUNT; id++) {
    const x = (rand() - 0.5) * 2.4;
    const y = 0.6 + rand() * 2.0;
    const z = (rand() - 0.5) * 2.0;
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(0.22)
        .setAngularDamping(0.12)
    );
    if (typeof rb.enableCcd === 'function') rb.enableCcd(true);
    const col = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(4.0)
        .setFriction(0.75)
        .setRestitution(0.08)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb
    );
    ballMap.set(col.handle, id);
    balls.push({ id, rb });
  }

  return { world, balls, ballMap, drumBody, gateBody, sensorHandle };
}

// ── single run ─────────────────────────────────────────────────────────────────
function runOnce(seed) {
  const { world, balls, ballMap, drumBody, gateBody, sensorHandle } = buildWorld(seed);
  const eq = new RAPIER.EventQueue(true);

  let gateOpen = false;
  let picked   = null;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    // Spin drum at constant angular velocity
    drumBody.setAngvel({ x: SPIN_SPEED, y: 0, z: 0 }, true);

    // Open gate after mixing
    if (!gateOpen && frame === MIX_FRAMES) {
      gateOpen = true;
      gateBody.setNextKinematicTranslation({ x: 0, y: GATE_OPEN_Y, z: 0 });
    }

    // Nudge floor-level balls toward outlet
    if (gateOpen && picked === null) {
      const framesSinceOpen = frame - MIX_FRAMES;
      const nudgeScale = 1 + Math.floor(framesSinceOpen / 120) * 0.5;
      for (const { rb } of balls) {
        const p = rb.translation();
        if (p.y < 0.75) {
          rb.applyImpulse({
            x: -p.x * 0.014 * nudgeScale,
            y:  0.003 * nudgeScale,
            z: -p.z * 0.014 * nudgeScale,
          }, true);
        }
      }
    }

    world.step(eq);

    eq.drainCollisionEvents((h1, h2, started) => {
      if (!started || picked !== null) return;
      const hit = h1 === sensorHandle || h2 === sensorHandle;
      const id  = ballMap.get(h1) ?? ballMap.get(h2);
      if (hit && id != null) {
        picked = id;
        gateBody.setNextKinematicTranslation({ x: 0, y: GATE_CLOSE_Y, z: 0 });
      }
    });

    // Fallback: position check
    if (picked === null && gateOpen) {
      for (const { id, rb } of balls) {
        if (rb.translation().y < -0.25) { picked = id; break; }
      }
    }

    if (picked !== null) {
      return { ok: true, pickedId: picked, frame, timeSec: (frame/60).toFixed(2) };
    }
  }
  return { ok: false, pickedId: null, frame: MAX_FRAMES, timeSec: (MAX_FRAMES/60).toFixed(2) };
}

// ── also check: does drum rotation actually move balls? ────────────────────────
function checkDrumRotatessBalls() {
  const { world, balls, drumBody } = buildWorld(42);
  const eq = new RAPIER.EventQueue(true);

  // Record initial Y positions
  const initY = balls.map(b => b.rb.translation().y);

  // Spin for 3 seconds without opening gate
  drumBody.setAngvel({ x: SPIN_SPEED, y: 0, z: 0 }, true);
  for (let f = 0; f < 180; f++) {
    drumBody.setAngvel({ x: SPIN_SPEED, y: 0, z: 0 }, true);
    world.step(eq);
  }

  // Count balls that moved significantly in angular (YZ) sense
  let movedCount = 0;
  for (let i = 0; i < balls.length; i++) {
    const p = balls[i].rb.translation();
    const dy = Math.abs(p.y - initY[i]);
    if (dy > 0.1) movedCount++;
  }

  return movedCount;
}

// ── main ───────────────────────────────────────────────────────────────────────
const RUNS = 10;
console.log(`\nCompound drum physics test — ${RUNS} runs\n${'─'.repeat(52)}`);

const results = [];
let failures  = 0;

for (let i = 0; i < RUNS; i++) {
  const seed   = Date.now() ^ (i * 0x9e3779b9);
  const result = runOnce(seed);
  results.push(result.pickedId);

  if (result.ok) {
    console.log(`Run ${String(i+1).padStart(2)}: ball #${String(result.pickedId).padStart(2)}  (frame ${result.frame}, t=${result.timeSec}s)`);
  } else {
    console.log(`Run ${String(i+1).padStart(2)}: FAILED — no ball exited within ${result.timeSec}s`);
    failures++;
  }
}

const unique = new Set(results.filter(Boolean));
console.log(`\n${'─'.repeat(52)}`);
console.log(`Success rate : ${RUNS - failures}/${RUNS}`);
console.log(`Unique IDs   : ${unique.size}/${RUNS}  [${[...unique].sort((a,b)=>a-b).join(', ')}]`);

const movedBalls = checkDrumRotatessBalls();
console.log(`Balls moved by drum rotation: ${movedBalls}/${BALL_COUNT}`);

const ok = failures === 0 && unique.size > 1 && movedBalls > BALL_COUNT * 0.5;
console.log(ok
  ? '\n✓ Compound drum OK — balls exit, are randomised, and follow rotation.'
  : '\n✗ Issues found — check logs above.');

process.exit(ok ? 0 : 1);

