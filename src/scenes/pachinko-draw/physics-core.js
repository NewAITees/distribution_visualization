/**
 * Pachinko draw physics core — RAPIER-agnostic.
 * Pass any RAPIER instance (browser or Node.js).
 *
 * All balls are dropped simultaneously from the top.
 * They fall through rotating spinner paddles that randomise paths.
 * Exit order through the floor hole = draw order.
 */

export const BALL_RADIUS = 0.22;

// Chamber geometry
const W = 2.6;   // half-width  X
const D = 0.75;  // half-depth  Z
const Y_TOP    =  8.0;
const Y_FLOOR  = -3.8;   // top of funnel
const Y_FUNNEL = -5.8;   // bottom of funnel / exit point
const Y_SENSOR = Y_FUNNEL; // sensor centered on the funnel exit hole
const HOLE_HALF_X = 0.34; // exit hole half-width at funnel bottom
const HOLE_HALF_Z = HOLE_HALF_X * 0.8;

// Spinner definitions: [x, y, angVelZ, halfLenX, halfDepthZ]
// 3 rows; alternating X positions; different speeds/lengths for chaotic paths
const SPINNER_DEFS = [
  //  x      y    ω(rad/s)  halfLen  halfDepZ
  [-1.55,  3.2,   1.8,    0.78,   0.68],
  [ 0.00,  3.5,   1.2,    0.82,   0.68],
  [ 1.55,  3.2,   2.1,    0.78,   0.68],

  [-0.80,  0.9,   2.4,    0.72,   0.65],
  [ 0.80,  1.1,   1.6,    0.72,   0.65],

  [-1.55, -1.4,   1.9,    0.78,   0.68],
  [ 0.00, -1.1,   1.4,    0.82,   0.68],
  [ 1.55, -1.4,   2.2,    0.78,   0.68],
];
const SPINNER_HALF_THICK = 0.045;

/**
 * Build ball spawn positions for `count` balls without overlap.
 * Returns array of {x,y,z}.
 */
function spawnPositions(count) {
  const cols = 6, zRows = 3;
  const xStep = (W * 1.35) / (cols - 1);
  const zStep = (D * 1.1)  / (zRows - 1);
  const positions = [];
  for (let ly = 0; positions.length < count; ly++) {
    for (let lz = 0; lz < zRows && positions.length < count; lz++) {
      for (let lx = 0; lx < cols && positions.length < count; lx++) {
        positions.push({
          x: -W * 0.675 + lx * xStep + (Math.random() - 0.5) * 0.12,
          y: 5.6       + ly * 0.72   + (Math.random() - 0.5) * 0.10,
          z: -D * 0.55 + lz * zStep  + (Math.random() - 0.5) * 0.10,
        });
      }
    }
  }
  return positions;
}

/**
 * Create a pachinko-draw world.
 * @param {object} RAPIER   - Rapier module (browser or Node.js)
 * @param {object} options
 * @param {number} options.population  - total ball count
 * @param {Set}    options.successIds  - Set of ball IDs (1..population) that count as success
 * @param {number} [options.dt=1/60]   - physics timestep in seconds
 * @returns Simulation object with step() and exitOrder[]
 */
export function createPachinkoDrawWorld(RAPIER, {
  population = 36,
  successIds = new Set(),
  dt = 1 / 60,
} = {}) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = dt;
  world.integrationParameters.numSolverIterations = 8;
  world.integrationParameters.numAdditionalFrictionIterations = 4;

  const eq = new RAPIER.EventQueue(true);

  // Collision groups: balls ignore each other to prevent funnel jams.
  // membership bits | filter bits packed into a single u32 (high16 | low16).
  const GRP_STATIC = 0x0001; // walls, ramps, spinners, sensor
  const GRP_BALL   = 0x0002; // balls
  const GROUPS_STATIC = (GRP_STATIC << 16) | (GRP_STATIC | GRP_BALL);
  const GROUPS_BALL   = (GRP_BALL   << 16) | GRP_STATIC; // balls only hit statics

  function fixedBox(cx, cy, cz, hx, hy, hz, fr = 0.65, res = 0.18) {
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(fr).setRestitution(res)
        .setCollisionGroups(GROUPS_STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb,
    );
    return rb;
  }

  // Walls (left, right, back, front — extend from Y_TOP down to Y_FUNNEL)
  const wallCY = (Y_TOP + Y_FUNNEL) / 2;
  const wallHY = (Y_TOP - Y_FUNNEL) / 2;
  fixedBox(-W - 0.09, wallCY, 0,       0.09, wallHY, D + 0.18);
  fixedBox( W + 0.09, wallCY, 0,       0.09, wallHY, D + 0.18);
  fixedBox(0, wallCY, -D - 0.09, W + 0.18, wallHY, 0.09);
  fixedBox(0, wallCY,  D + 0.09, W + 0.18, wallHY, 0.09);

  // Funnel ramps: angled panels guiding balls toward the central exit hole.
  // The funnel slopes from ±W at Y_FLOOR down to ±HOLE_HALF_X at Y_FUNNEL.
  // Each ramp is a box rotated around Z (for left/right) or X (for front/back).
  {
    const funnelH  = Y_FLOOR - Y_FUNNEL;          // height of funnel (positive value)
    const funnelDX = W - HOLE_HALF_X;             // horizontal run
    const panelLen = Math.sqrt(funnelH * funnelH + funnelDX * funnelDX);
    const angle    = Math.atan2(funnelH, funnelDX); // tilt angle from horizontal
    const cx       = (W + HOLE_HALF_X) / 2;
    const cy       = (Y_FLOOR + Y_FUNNEL) / 2;

    // Left ramp (outer edge at -W high, inner edge at -HOLE_HALF_X low → rotate -angle around Z)
    const lbL = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-cx, cy, 0)
      .setRotation({ x: 0, y: 0, z: Math.sin(-angle / 2), w: Math.cos(angle / 2) }));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(panelLen / 2, 0.09, D)
        .setFriction(0.4).setRestitution(0.1)
        .setCollisionGroups(GROUPS_STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      lbL,
    );
    // Right ramp (outer edge at +W high, inner edge at +HOLE_HALF_X low → rotate +angle around Z)
    const lbR = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, 0)
      .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(panelLen / 2, 0.09, D)
        .setFriction(0.4).setRestitution(0.1)
        .setCollisionGroups(GROUPS_STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      lbR,
    );
    // Front ramp (outer edge at +D high, inner edge at +HOLE_HALF_Z low → rotate -angleZ around X)
    const funnelDZ  = D - HOLE_HALF_Z;
    const panelLenZ = Math.sqrt(funnelH * funnelH + funnelDZ * funnelDZ);
    const angleZ    = Math.atan2(funnelH, funnelDZ);
    const czC       = (D + HOLE_HALF_Z) / 2;
    const lbF = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, cy, czC)
      .setRotation({ x: Math.sin(-angleZ / 2), y: 0, z: 0, w: Math.cos(angleZ / 2) }));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(W, 0.09, panelLenZ / 2)
        .setFriction(0.4).setRestitution(0.1)
        .setCollisionGroups(GROUPS_STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      lbF,
    );
    // Back ramp (outer edge at -D high, inner edge at -HOLE_HALF_Z low → rotate +angleZ around X)
    const lbB = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, cy, -czC)
      .setRotation({ x: Math.sin(angleZ / 2), y: 0, z: 0, w: Math.cos(angleZ / 2) }));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(W, 0.09, panelLenZ / 2)
        .setFriction(0.4).setRestitution(0.1)
        .setCollisionGroups(GROUPS_STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      lbB,
    );
  }

  // Sensor — only the center hole should trigger an exit
  const sensorRb = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, Y_SENSOR, 0),
  );
  const sensorCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(HOLE_HALF_X - 0.02, 0.22, HOLE_HALF_Z - 0.02)
      .setSensor(true)
      .setCollisionGroups(GROUPS_STATIC)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    sensorRb,
  );
  const sensorHandle = sensorCol.handle;

  // Spinners
  const spinnerBodies = SPINNER_DEFS.map(([x, y, omega, hLen, hDep]) => {
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(x, y, 0),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hLen, SPINNER_HALF_THICK, hDep)
        .setFriction(0.55).setRestitution(0.25)
        .setCollisionGroups(GROUPS_STATIC)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb,
    );
    return { rb, omega };
  });

  // Balls
  const positions = spawnPositions(population);
  const balls = [];
  const ballMap = new Map(); // collider handle → ball entry

  for (let i = 0; i < population; i++) {
    const id = i + 1;
    const { x, y, z } = positions[i];
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(0.08)
        .setAngularDamping(0.15),
    );
    if (typeof rb.enableCcd === 'function') rb.enableCcd(true);
    const col = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(4.0).setFriction(0.6).setRestitution(0.22)
        .setCollisionGroups(GROUPS_BALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      rb,
    );
    const entry = { id, rb, col, success: successIds.has(id), removed: false };
    balls.push(entry);
    ballMap.set(col.handle, entry);
  }

  const exitOrder = [];  // balls in exit order

  function removeBall(entry) {
    if (entry.removed) return;
    entry.removed = true;
    exitOrder.push(entry);
    if (entry.rb) {
      world.removeRigidBody(entry.rb);
      entry.rb = null;
    }
  }

  function step(dtSec = dt) {
    for (const sp of spinnerBodies) {
      sp.rb.setAngvel({ x: 0, y: 0, z: sp.omega }, true);
    }
    world.integrationParameters.dt = dtSec;
    world.step(eq);

    const newExits = [];

    eq.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const isH1Sensor = h1 === sensorHandle;
      const isH2Sensor = h2 === sensorHandle;
      if (!isH1Sensor && !isH2Sensor) return;
      const ballHandle = isH1Sensor ? h2 : h1;
      const entry = ballMap.get(ballHandle);
      if (entry && !entry.removed) {
        newExits.push(entry);
        removeBall(entry);
      }
    });

    return newExits;
  }

  return {
    world,
    balls,
    ballMap,
    sensorHandle,
    spinnerBodies,
    exitOrder,
    step,
    SPINNER_DEFS,
  };
}
