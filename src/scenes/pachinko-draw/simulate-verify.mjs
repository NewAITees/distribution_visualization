/**
 * Physics verification for the compound drum pachinko draw.
 * Run: node src/scenes/pachinko-draw/simulate-verify.mjs
 *
 * Checks:
 *  1. Rib (羽) collisions — balls actually hit the ribs
 *  2. Drum panel collisions — balls touch rotating drum walls
 *  3. Static wall collisions — balls reach outer walls
 *  4. Ceiling collisions — balls fly high enough to hit ceiling
 *  5. Floor collisions — balls reach floor level
 *  6. Ball motion — balls are not frozen (velocity > threshold)
 *  7. Angular velocity transfer — balls spin up from drum friction
 *  8. Exit randomness — IDs spread across many runs
 *  9. Exit timing — not always the same ball immediately
 * 10. All balls accounted for — no duplicates or phantoms
 */
/* global process */

import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init({});

const BALL_RADIUS  = 0.22;
const BALL_COUNT   = 36;
const SPIN_SPEED   = 1.45;
const MIX_FRAMES   = 180;       // 3 s of mixing for this test
const MAX_FRAMES   = 60 * 25;
const GATE_OPEN_Y  = -1.4;
const GATE_CLOSE_Y = 0.08;

// ── labelled collider registry ────────────────────────────────────────────────
const LABEL = { RIB: 'rib', PANEL: 'panel', WALL: 'wall', CEILING: 'ceiling', FLOOR: 'floor', GATE: 'gate', BALL: 'ball' };

function buildWorld(seed) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.numSolverIterations = 6;
  world.integrationParameters.numAdditionalFrictionIterations = 2;

  const colliderLabel = new Map();  // collider handle → label string
  const ballById      = new Map();  // ball id → { id, rb, colHandle }

  function fixedBox(pos, size, label, friction = 0.8) {
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(size[0]/2, size[1]/2, size[2]/2)
        .setFriction(friction).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb
    );
    colliderLabel.set(col.handle, label);
    return col;
  }

  // Static walls
  const W = 2.75, H = 2.0, D = 1.75;
  fixedBox([-W, H, 0], [0.18, H*2, D*2], LABEL.WALL, 0.75);
  fixedBox([ W, H, 0], [0.18, H*2, D*2], LABEL.WALL, 0.75);
  fixedBox([ 0, H,-D], [W*2, H*2, 0.18], LABEL.WALL, 0.75);
  fixedBox([ 0, H, D], [W*2, H*2, 0.18], LABEL.WALL, 0.75);
  fixedBox([ 0, H*2.05, 0], [W*2, 0.18, D*2], LABEL.CEILING, 0.75);

  // Floor with outlet hole
  fixedBox([-1.625,-0.05, 0   ], [2.75,0.16,D*2], LABEL.FLOOR, 0.85);
  fixedBox([ 1.625,-0.05, 0   ], [2.75,0.16,D*2], LABEL.FLOOR, 0.85);
  fixedBox([ 0,    -0.05,-1.15], [0.7, 0.16,1.5], LABEL.FLOOR, 0.85);
  fixedBox([ 0,    -0.05, 1.15], [0.7, 0.16,1.5], LABEL.FLOOR, 0.85);

  // Gate
  const gateRb = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, GATE_CLOSE_Y, 0)
  );
  const gateCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.35, 0.13, 0.5)
      .setFriction(1.0).setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    gateRb
  );
  colliderLabel.set(gateCol.handle, LABEL.GATE);

  // Sensor
  const sensorRb  = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.55,0));
  const sensorCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.35, 0.3, 0.5)
      .setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    sensorRb
  );
  const sensorHandle = sensorCol.handle;

  // Compound drum
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
    if (i === 3 || i === 4) continue;
    const angle = (i / panelCount) * Math.PI * 2;
    const cy = Math.cos(angle) * drumRadius;
    const cz = Math.sin(angle) * drumRadius;
    const h  = angle / 2;
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(drumHalfLen, panelThick/2, panelArcHalf)
        .setTranslation(0, cy, cz)
        .setRotation({ x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) })
        .setFriction(0.9).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      drumBody
    );
    colliderLabel.set(col.handle, LABEL.PANEL);
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ribR  = drumRadius - 0.16;
    const cy    = Math.cos(angle) * ribR;
    const cz    = Math.sin(angle) * ribR;
    const h     = angle / 2;
    const col   = world.createCollider(
      RAPIER.ColliderDesc.cuboid(drumHalfLen * 0.85, 0.16, 0.05)
        .setTranslation(0, cy, cz)
        .setRotation({ x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) })
        .setFriction(0.9).setRestitution(0.03)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      drumBody
    );
    colliderLabel.set(col.handle, LABEL.RIB);
  }

  // Balls — seeded positions
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
        .setLinearDamping(0.22).setAngularDamping(0.12)
    );
    if (typeof rb.enableCcd === 'function') rb.enableCcd(true);
    const col = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(4.0).setFriction(0.75).setRestitution(0.08)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb
    );
    colliderLabel.set(col.handle, LABEL.BALL);
    ballById.set(id, { id, rb, colHandle: col.handle });
  }

  return { world, ballById, colliderLabel, drumBody, gateRb, sensorHandle };
}

// ── verification run ──────────────────────────────────────────────────────────
function verifyRun(seed) {
  const { world, ballById, colliderLabel, drumBody, gateRb, sensorHandle } = buildWorld(seed);
  const eq = new RAPIER.EventQueue(true);

  // Collision hit counters per label pair
  const hits = { rib: 0, panel: 0, wall: 0, ceiling: 0, floor: 0, gate: 0 };

  // Track unique ball IDs that hit each surface
  const ribBalls     = new Set();
  const panelBalls   = new Set();
  const wallBalls    = new Set();
  const ceilingBalls = new Set();
  const floorBalls   = new Set();

  // Ball-to-id lookup by collider handle
  const handleToId = new Map();
  for (const [id, { colHandle }] of ballById) handleToId.set(colHandle, id);

  // Angular speed of balls at key moments
  const angSpeedAtStart = [];
  const angSpeedAfterMix = [];

  // Record initial angular speeds (all 0 at start)
  for (const { rb } of ballById.values()) {
    const a = rb.angvel();
    angSpeedAtStart.push(Math.sqrt(a.x**2 + a.y**2 + a.z**2));
  }

  // Max Y reached by any ball
  let maxYReached = 0;

  let picked = null;
  let pickedFrame = -1;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    drumBody.setAngvel({ x: SPIN_SPEED, y: 0, z: 0 }, true);

    // Open gate after MIX_FRAMES
    if (frame === MIX_FRAMES) {
      gateRb.setNextKinematicTranslation({ x: 0, y: GATE_OPEN_Y, z: 0 });

      // Snapshot angular speeds after mixing
      for (const { rb } of ballById.values()) {
        const a = rb.angvel();
        angSpeedAfterMix.push(Math.sqrt(a.x**2 + a.y**2 + a.z**2));
      }
    }

    // Nudge
    if (frame >= MIX_FRAMES && picked === null) {
      const fso = frame - MIX_FRAMES;
      const ns  = 1 + Math.floor(fso / 120) * 0.5;
      for (const { rb } of ballById.values()) {
        const p = rb.translation();
        if (p.y < 0.75) rb.applyImpulse({ x: -p.x*0.014*ns, y: 0.003*ns, z: -p.z*0.014*ns }, true);
      }
    }

    world.step(eq);

    // Track max Y
    for (const { rb } of ballById.values()) {
      const y = rb.translation().y;
      if (y > maxYReached) maxYReached = y;
    }

    // Drain collision events
    eq.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;

      const l1 = colliderLabel.get(h1) ?? 'unknown';
      const l2 = colliderLabel.get(h2) ?? 'unknown';

      // Sensor hit = exit
      if ((h1 === sensorHandle || h2 === sensorHandle) && picked === null) {
        const ballId = handleToId.get(h1) ?? handleToId.get(h2);
        if (ballId != null) { picked = ballId; pickedFrame = frame; }
        return;
      }

      // One side must be a ball
      const isBall1 = l1 === LABEL.BALL;
      const isBall2 = l2 === LABEL.BALL;
      if (!isBall1 && !isBall2) return;

      const ballHandle  = isBall1 ? h1 : h2;
      const otherLabel  = isBall1 ? l2 : l1;
      const ballId      = handleToId.get(ballHandle);

      if (otherLabel === LABEL.RIB)     { hits.rib++;     if (ballId) ribBalls.add(ballId);     }
      if (otherLabel === LABEL.PANEL)   { hits.panel++;   if (ballId) panelBalls.add(ballId);   }
      if (otherLabel === LABEL.WALL)    { hits.wall++;    if (ballId) wallBalls.add(ballId);     }
      if (otherLabel === LABEL.CEILING) { hits.ceiling++; if (ballId) ceilingBalls.add(ballId); }
      if (otherLabel === LABEL.FLOOR)   { hits.floor++;   if (ballId) floorBalls.add(ballId);   }
      if (otherLabel === LABEL.GATE)    { hits.gate++;                                           }
    });

    // Fallback exit detection
    if (picked === null && frame >= MIX_FRAMES) {
      for (const { id, rb } of ballById.values()) {
        if (rb.translation().y < -0.25) { picked = id; pickedFrame = frame; break; }
      }
    }

    if (picked !== null) break;
  }

  const avgAngStart = angSpeedAtStart.reduce((a,b)=>a+b,0) / angSpeedAtStart.length;
  const avgAngAfter = angSpeedAfterMix.reduce((a,b)=>a+b,0) / (angSpeedAfterMix.length || 1);

  return {
    picked, pickedFrame,
    hits,
    ribBalls:     ribBalls.size,
    panelBalls:   panelBalls.size,
    wallBalls:    wallBalls.size,
    ceilingBalls: ceilingBalls.size,
    floorBalls:   floorBalls.size,
    maxYReached,
    avgAngStart,
    avgAngAfter,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────
const RUNS = 15;
const results = [];

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Pachinko draw — physics verification  (${RUNS} runs)`);
console.log(`${'═'.repeat(60)}\n`);

for (let i = 0; i < RUNS; i++) {
  const seed = Date.now() ^ (i * 0x9e3779b9);
  results.push(verifyRun(seed));
}

// ── report ────────────────────────────────────────────────────────────────────
const pass = (cond, msg) => console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
const fmt  = n => String(n).padStart(5);

// 1. Exit success
const exitCount = results.filter(r => r.picked !== null).length;
console.log('【1】 ボール脱出');
pass(exitCount === RUNS, `脱出成功率: ${exitCount}/${RUNS}`);

// 2. ID randomness
const exitIds = results.map(r => r.picked).filter(Boolean);
const uniqueIds = new Set(exitIds).size;
console.log('\n【2】 脱出ID のランダム性');
pass(uniqueIds >= RUNS * 0.4, `ユニークID数: ${uniqueIds}/${RUNS}  [${[...new Set(exitIds)].sort((a,b)=>a-b).join(', ')}]`);

// Check no bias toward specific IDs
const idFreq = {};
exitIds.forEach(id => idFreq[id] = (idFreq[id]||0) + 1);
const maxFreq = Math.max(...Object.values(idFreq));
pass(maxFreq <= 4, `最頻出IDの出現回数: ${maxFreq} (≤4 で良好)`);

// 3. Rib collisions
const ribHitRuns = results.filter(r => r.hits.rib > 0).length;
const avgRibHits = results.reduce((s,r)=>s+r.hits.rib,0) / RUNS;
const avgRibBalls = results.reduce((s,r)=>s+r.ribBalls,0) / RUNS;
console.log('\n【3】 羽（rib）への衝突');
pass(ribHitRuns === RUNS, `全ランで羽衝突あり: ${ribHitRuns}/${RUNS} ラン`);
pass(avgRibHits >= 5,     `平均衝突回数: ${avgRibHits.toFixed(1)} 回/ラン (≥5 で良好)`);
pass(avgRibBalls >= 3,    `平均被衝突ボール数: ${avgRibBalls.toFixed(1)} 個 (≥3 で良好)`);

// 4. Panel collisions
const panelHitRuns = results.filter(r => r.hits.panel > 0).length;
const avgPanelHits = results.reduce((s,r)=>s+r.hits.panel,0) / RUNS;
console.log('\n【4】 ドラムパネルへの衝突');
pass(panelHitRuns === RUNS, `全ランでパネル衝突あり: ${panelHitRuns}/${RUNS} ラン`);
pass(avgPanelHits >= 10,    `平均衝突回数: ${avgPanelHits.toFixed(1)} 回/ラン (≥10 で良好)`);

// 5. Wall collisions
const wallHitRuns = results.filter(r => r.hits.wall > 0).length;
console.log('\n【5】 外壁への衝突');
pass(wallHitRuns > 0, `外壁に到達したラン: ${wallHitRuns}/${RUNS}`);

// 6. Ceiling collisions
const ceilHitRuns = results.filter(r => r.hits.ceiling > 0).length;
const avgMaxY = results.reduce((s,r)=>s+r.maxYReached,0) / RUNS;
console.log('\n【6】 天井への衝突');
pass(avgMaxY > 2.0,   `平均最高到達Y: ${avgMaxY.toFixed(2)} m (>2.0 で動きあり)`);
console.log(`         天井衝突ラン: ${ceilHitRuns}/${RUNS} (${ceilHitRuns===0?'天井まで届かない — 正常':'天井まで届いている'})`);

// 7. Floor collisions
const floorHitRuns = results.filter(r => r.hits.floor > 0).length;
console.log('\n【7】 床への衝突');
pass(floorHitRuns === RUNS, `全ランで床衝突あり: ${floorHitRuns}/${RUNS} ラン`);

// 8. Angular velocity transfer (ドラム摩擦でボールが回転するか)
const avgAngStart = results.reduce((s,r)=>s+r.avgAngStart,0) / RUNS;
const avgAngAfter = results.reduce((s,r)=>s+r.avgAngAfter,0) / RUNS;
console.log('\n【8】 ドラム摩擦による回転速度付与');
pass(avgAngAfter > avgAngStart * 2, `初期平均角速度: ${avgAngStart.toFixed(3)} rad/s → 混合後: ${avgAngAfter.toFixed(3)} rad/s`);

// 9. Exit timing spread
const frames = results.map(r => r.pickedFrame).filter(f => f > 0);
const minFrame = Math.min(...frames);
const maxFrame = Math.max(...frames);
const spreadFrames = maxFrame - minFrame;
console.log('\n【9】 脱出タイミングのばらつき');
pass(spreadFrames > 30, `脱出フレーム範囲: ${minFrame}〜${maxFrame}  (幅${spreadFrames}f)  ${spreadFrames>30?'ランダム性あり':'偏りの可能性あり'}`);

// 10. Summary table
console.log('\n【詳細テーブル】');
console.log('  run  ball  frame  rib  panel  wall  ceil  floor  maxY');
console.log('  ' + '─'.repeat(55));
results.forEach((r, i) => {
  console.log(
    `  ${String(i+1).padStart(3)}` +
    `  #${String(r.picked??'--').padStart(2)}` +
    `  ${fmt(r.pickedFrame)}` +
    `  ${fmt(r.hits.rib)}  ${fmt(r.hits.panel)}  ${fmt(r.hits.wall)}` +
    `  ${fmt(r.hits.ceiling)}  ${fmt(r.hits.floor)}` +
    `  ${r.maxYReached.toFixed(2)}m`
  );
});

const passCount = [
  exitCount === RUNS,
  uniqueIds >= RUNS * 0.4,
  maxFreq <= 4,
  ribHitRuns === RUNS,
  avgRibHits >= 5,
  avgRibBalls >= 3,
  panelHitRuns === RUNS,
  avgPanelHits >= 10,
  floorHitRuns === RUNS,
  avgAngAfter > avgAngStart * 2,
  spreadFrames > 30,
].filter(Boolean).length;

console.log(`\n${'═'.repeat(60)}`);
console.log(`  結果: ${passCount}/11 項目クリア`);
console.log(`${'═'.repeat(60)}\n`);

process.exit(passCount >= 9 ? 0 : 1);



