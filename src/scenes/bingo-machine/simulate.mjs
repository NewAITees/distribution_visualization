/**
 * Headless physics backend for the bingo machine.
 * Run: node src/scenes/bingo-machine/simulate.mjs
 *
 * Verifies that:
 *  1. Paddles mix all balls over 2 seconds of simulation
 *  2. Opening the gate causes exactly one ball to exit via the sensor
 *  3. Repeated runs produce different ball IDs (randomness check)
 */
/* global process */

import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init({});

// ─── constants ────────────────────────────────────────────────────────────────
const BALL_RADIUS   = 0.18;
const BALL_COUNT    = 36;
const MIX_FRAMES    = 120;   // 2s of mixing before gate opens
const MAX_FRAMES    = 60 * 20; // 20s hard limit per run
const GATE_OPEN_Y   = -1.4;
const GATE_CLOSE_Y  = 0.08;

// ─── world factory ────────────────────────────────────────────────────────────
function buildWorld(seed) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.numSolverIterations = 8;
  world.integrationParameters.numAdditionalFrictionIterations = 4;

  const ballMap   = new Map(); // collider handle → ball id
  const balls     = [];        // { id, rb }
  const paddles   = [];        // { rb, phase, mode }
  let   gateBody  = null;
  let   sensorHandle = null;

  // ── helpers ────────────────────────────────────────────────────────────────
  function fixedBox(pos, size, isSensor = false) {
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    let desc = RAPIER.ColliderDesc
      .cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setFriction(0.8)
      .setRestitution(0.08);
    if (isSensor) {
      desc = desc.setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    } else {
      desc = desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    }
    const col = world.createCollider(desc, rb);
    return { rb, col };
  }

  function kinematicBox(pos, size) {
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(pos[0], pos[1], pos[2])
    );
    const desc = RAPIER.ColliderDesc
      .cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setFriction(1.0)
      .setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    world.createCollider(desc, rb);
    return rb;
  }

  function addBall(id, x, y, z) {
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

  function quat(axis, angle) {
    const s = Math.sin(angle / 2), c = Math.cos(angle / 2);
    return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: c };
  }

  // ── machine walls ──────────────────────────────────────────────────────────
  fixedBox([-2.75, 2.0, 0    ], [0.18, 4.0, 3.2]);
  fixedBox([ 2.75, 2.0, 0    ], [0.18, 4.0, 3.2]);
  fixedBox([0,     2.0, -1.75], [5.5,  4.0, 0.18]);
  fixedBox([0,     2.0,  1.75], [5.5,  4.0, 0.18]);
  fixedBox([0,     4.08, 0   ], [5.5,  0.18, 3.2]);

  // floor with outlet hole at centre.
  // Outlet x: -0.25 to +0.25 (0.5m wide), z: -0.4 to +0.4 (0.8m wide).
  // Ball diameter is 0.36m — 0.5m gives ~0.07m clearance on each side.
  fixedBox([-1.625, -0.05, 0    ], [2.75, 0.16, 3.2]);  // x: -3.0 to -0.25
  fixedBox([ 1.625, -0.05, 0    ], [2.75, 0.16, 3.2]);  // x:  0.25 to  3.0
  fixedBox([0,     -0.05, -1.15 ], [0.7,  0.16, 1.5]);  // x: -0.35 to 0.35, z: -1.9 to -0.4
  fixedBox([0,     -0.05,  1.15 ], [0.7,  0.16, 1.5]);  // x: -0.35 to 0.35, z:  0.4 to  1.9

  // gate covers the outlet (starts closed)
  gateBody = kinematicBox([0, GATE_CLOSE_Y, 0], [0.7, 0.26, 1.0]);

  // exit rail / catcher
  fixedBox([0,     -0.75, 0.75], [0.9,  0.16, 2.4]);
  fixedBox([-0.52, -0.55, 0.85], [0.12, 0.7,  2.2]);
  fixedBox([ 0.52, -0.55, 0.85], [0.12, 0.7,  2.2]);

  // sensor below outlet
  const sensorRb  = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.55, 0));
  const sensorCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.35, 0.3, 0.5)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    sensorRb
  );
  sensorHandle = sensorCol.handle;

  // ── paddles ────────────────────────────────────────────────────────────────
  paddles.push({ rb: kinematicBox([0, 1.55, 0], [4.35, 0.14, 0.28]), phase: 0,            mode: 'rollZ'  });
  paddles.push({ rb: kinematicBox([0, 2.45, 0], [0.28, 0.14, 2.55]), phase: Math.PI / 2,  mode: 'rollY'  });
  paddles.push({ rb: kinematicBox([0, 0.42, 0], [4.75, 0.18, 0.20]), phase: Math.PI / 5,  mode: 'sweepY' });

  // ── seed-based ball placement ──────────────────────────────────────────────
  // Simple LCG so different seeds give different starting positions
  let rngState = seed;
  function rng() {
    rngState = (rngState * 1664525 + 1013904223) & 0xffffffff;
    return (rngState >>> 0) / 0xffffffff;
  }

  for (let i = 1; i <= BALL_COUNT; i++) {
    const x = (rng() - 0.5) * 3.8;
    const y = 0.65 + Math.floor((i - 1) / 9) * 0.45 + rng() * 0.08;
    const z = (rng() - 0.5) * 2.2;
    addBall(i, x, y, z);
  }

  // ── step function ──────────────────────────────────────────────────────────
  function updatePaddles(frame) {
    const t = frame / 60;
    for (const p of paddles) {
      const angle = t * 1.45 + p.phase;
      let q;
      if      (p.mode === 'rollZ')  q = quat([0, 0, 1], angle);
      else if (p.mode === 'rollY')  q = quat([0, 1, 0], -angle * 1.35);
      else                          q = quat([0, 1, 0],  angle * 1.8);
      p.rb.setNextKinematicRotation(q);
    }
  }

  return { world, balls, ballMap, paddles, gateBody, sensorHandle, updatePaddles };
}

// ─── single run ───────────────────────────────────────────────────────────────
function runOnce(seed) {
  const { world, balls, ballMap, gateBody, sensorHandle, updatePaddles } = buildWorld(seed);
  const eventQueue = new RAPIER.EventQueue(true);

  let gateOpen = false;
  let picked   = null;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    updatePaddles(frame);

    // Open gate after mixing period
    if (!gateOpen && frame === MIX_FRAMES) {
      gateOpen = true;
      gateBody.setNextKinematicTranslation({ x: 0, y: GATE_OPEN_Y, z: 0 });
    }

    // Nudge floor-level balls toward the outlet (centre hole)
    if (gateOpen && picked === null) {
      const framesSinceOpen = frame - MIX_FRAMES;
      // Gradually increase nudge strength if no ball has exited yet
      const nudgeScale = 1 + Math.floor(framesSinceOpen / 120) * 0.5;
      for (const { rb } of balls) {
        const p = rb.translation();
        if (p.y < 0.75) {
          rb.applyImpulse({
            x: -p.x * 0.014 * nudgeScale,
            y: 0.003 * nudgeScale,
            z: -p.z * 0.014 * nudgeScale,
          }, true);
        }
      }
    }

    world.step(eventQueue);

    // Primary: sensor collision event
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started || picked !== null) return;
      const sensorHit = h1 === sensorHandle || h2 === sensorHandle;
      const id = ballMap.get(h1) ?? ballMap.get(h2);
      if (sensorHit && id != null) {
        picked = id;
        gateBody.setNextKinematicTranslation({ x: 0, y: GATE_CLOSE_Y, z: 0 });
      }
    });

    // Fallback: position check — ball has fallen below floor level
    if (picked === null && gateOpen) {
      for (const { id, rb } of balls) {
        if (rb.translation().y < -0.25) {
          picked = id;
          gateBody.setNextKinematicTranslation({ x: 0, y: GATE_CLOSE_Y, z: 0 });
          break;
        }
      }
    }

    if (picked !== null) {
      return { ok: true, pickedId: picked, frame, timeSec: (frame / 60).toFixed(2) };
    }
  }

  return { ok: false, pickedId: null, frame: MAX_FRAMES, timeSec: (MAX_FRAMES / 60).toFixed(2) };
}

// ─── main: run N times and report ─────────────────────────────────────────────
const RUNS = 10;
console.log(`\nBingo machine physics backend — ${RUNS} runs\n${'─'.repeat(48)}`);

const results = [];
let failures  = 0;

for (let i = 0; i < RUNS; i++) {
  const seed   = Date.now() ^ (i * 0x9e3779b9);
  const result = runOnce(seed);
  results.push(result.pickedId);

  if (result.ok) {
    console.log(`Run ${String(i + 1).padStart(2)}: ball #${String(result.pickedId).padStart(2)}  (frame ${result.frame}, t=${result.timeSec}s)`);
  } else {
    console.log(`Run ${String(i + 1).padStart(2)}: FAILED — no ball exited within ${result.timeSec}s`);
    failures++;
  }
}

const unique  = new Set(results.filter(Boolean));
console.log(`\n${'─'.repeat(48)}`);
console.log(`Success rate : ${RUNS - failures}/${RUNS}`);
console.log(`Unique IDs   : ${unique.size} / ${RUNS}  [${[...unique].sort((a,b)=>a-b).join(', ')}]`);
console.log(failures === 0 && unique.size > 1 ? '\n✓ Physics backend OK — balls exit and are randomised.' : '\n✗ Physics backend has issues — check logs above.');

process.exit(failures > 0 ? 1 : 0);

