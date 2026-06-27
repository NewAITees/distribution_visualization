import { createThreeRuntime, createThreeRenderer } from '../../three/runtime.js';
import { createPachinkoDrawPhysics, BALL_RADIUS } from './physics.js';
import { hypergeometricPmf, binomialPmf, normalizeWeights } from '../../core/math.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function disposeMesh(mesh) {
  mesh.parent?.remove(mesh);
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
  else mesh.material.dispose();
}

// ── scene factory ─────────────────────────────────────────────────────────────

export function createPachinkoDrawScene({ canvas, state }) {
  const runtime = createThreeRuntime();
  const { THREE, scene, camera, boardGroup } = runtime;
  const renderer = createThreeRenderer(canvas);

  scene.fog = new THREE.Fog(0x08131d, 22, 55);
  // Camera: see full chamber top to exit
  camera.position.set(0, -1.8, 17.0);
  camera.lookAt(0, -1.5, 0);

  // Floor decoration — lower than chamber floor (Y_FLOOR = -4.0)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x0f2133, roughness: 0.98, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7.5;
  boardGroup.add(floor);
  const grid = new THREE.GridHelper(44, 30, 0x274e6d, 0x173247);
  grid.position.y = -7.49;
  boardGroup.add(grid);

  // Chamber visual dims — match physics-core constants
  const CW = 2.6, CD = 0.75;
  const Y_FLOOR_VIS  = -3.8;
  const Y_FUNNEL_VIS = -5.8;
  const Y_TOP_VIS    =  8.0;
  const CH = Y_TOP_VIS - Y_FLOOR_VIS;
  const chamberY = (Y_TOP_VIS + Y_FLOOR_VIS) / 2;

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8bc8ff, transparent: true, opacity: 0.09,
    roughness: 0.1, metalness: 0.04, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3377aa, roughness: 0.5, metalness: 0.4 });

  const chamberGroup = new THREE.Group();
  boardGroup.add(chamberGroup);

  // Front & back glass panels
  [CD, -CD].forEach(z => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(CW * 2, CH), glassMat);
    p.position.set(0, chamberY, z);
    chamberGroup.add(p);
  });
  // Left & right glass panels
  [-CW, CW].forEach(x => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(CD * 2, CH), glassMat);
    p.rotation.y = Math.PI / 2;
    p.position.set(x, chamberY, 0);
    chamberGroup.add(p);
  });
  // Vertical edge tubes
  const tubeGeo = new THREE.CylinderGeometry(0.05, 0.05, CH, 8);
  [[-CW, CD], [CW, CD], [-CW, -CD], [CW, -CD]].forEach(([x, z]) => {
    const t = new THREE.Mesh(tubeGeo, edgeMat);
    t.position.set(x, chamberY, z);
    chamberGroup.add(t);
  });

  // Funnel visual — angled ramps matching physics geometry
  const HOLE_VIS   = 0.34;
  const funnelH    = Y_FLOOR_VIS - Y_FUNNEL_VIS;  // 2.0m
  const funnelDX   = CW - HOLE_VIS;
  const panelLen   = Math.sqrt(funnelH * funnelH + funnelDX * funnelDX);
  const funnelAngle = Math.atan2(funnelH, funnelDX);
  const funnelCX   = (CW + HOLE_VIS) / 2;
  const funnelCY   = (Y_FLOOR_VIS + Y_FUNNEL_VIS) / 2;

  const funnelMat = new THREE.MeshStandardMaterial({
    color: 0x2255aa, roughness: 0.4, metalness: 0.5,
    transparent: true, opacity: 0.75, side: THREE.DoubleSide,
  });

  // Left ramp — outer edge high (Y_FLOOR), inner edge low (Y_FUNNEL)
  const lRamp = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.14, CD * 2), funnelMat);
  lRamp.position.set(-funnelCX, funnelCY, 0);
  lRamp.rotation.z = -funnelAngle;
  chamberGroup.add(lRamp);

  // Right ramp
  const rRamp = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.14, CD * 2), funnelMat);
  rRamp.position.set(funnelCX, funnelCY, 0);
  rRamp.rotation.z = funnelAngle;
  chamberGroup.add(rRamp);

  // Front ramp
  const funnelDZ  = CD - HOLE_VIS * 0.8;
  const panelLenZ = Math.sqrt(funnelH * funnelH + funnelDZ * funnelDZ);
  const funnelAZ  = Math.atan2(funnelH, funnelDZ);
  const funnelCZ  = (CD + HOLE_VIS * 0.8) / 2;

  const fRamp = new THREE.Mesh(new THREE.BoxGeometry(HOLE_VIS * 2 + 1.0, 0.14, panelLenZ), funnelMat);
  fRamp.position.set(0, funnelCY, funnelCZ);
  fRamp.rotation.x = funnelAZ;
  chamberGroup.add(fRamp);

  // Back ramp
  const bRamp = new THREE.Mesh(new THREE.BoxGeometry(HOLE_VIS * 2 + 1.0, 0.14, panelLenZ), funnelMat);
  bRamp.position.set(0, funnelCY, -funnelCZ);
  bRamp.rotation.x = -funnelAZ;
  chamberGroup.add(bRamp);

  // Glowing ring at the funnel exit
  const exitRing = new THREE.Mesh(
    new THREE.TorusGeometry(HOLE_VIS + 0.06, 0.06, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 1.0 }),
  );
  exitRing.rotation.x = Math.PI / 2;
  exitRing.position.set(0, Y_FUNNEL_VIS + 0.05, 0);
  chamberGroup.add(exitRing);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-5, 10, 8);
  scene.add(key);
  const fill = new THREE.PointLight(0x84c6ff, 1.0, 50);
  fill.position.set(4, 6, 8);
  scene.add(fill);

  // ── runtime state ─────────────────────────────────────────────────────────

  // spinnerMeshes: Array of { mesh: THREE.Mesh, rb: RigidBody }
  // ballEntries: Map<id, { ball, mesh: THREE.Mesh }>
  const spinnerMeshes = [];
  const ballEntries   = new Map();

  const rs = {
    mode: 'pachinko-draw',
    withReplacement: false,
    running: false,
    paused: false,
    complete: false,
    total: 0,
    trialIndex: 0,
    drawsDone: 0,
    drawnSuccesses: 0,
    draws: 1,
    physics: null,
    escapedBalls: [],  // Array of { mesh: THREE.Mesh, vel: THREE.Vector3 }
  };

  // ── trial helpers ─────────────────────────────────────────────────────────

  function clearTrial() {
    // Dispose spinner meshes
    for (const { mesh } of spinnerMeshes) disposeMesh(mesh);
    spinnerMeshes.length = 0;

    // Dispose ball meshes
    for (const { mesh } of ballEntries.values()) disposeMesh(mesh);
    ballEntries.clear();

    // Dispose escaped-ball meshes
    for (const e of rs.escapedBalls) disposeMesh(e.mesh);
    rs.escapedBalls = [];

    rs.physics     = null;
    rs.drawsDone   = 0;
    rs.drawnSuccesses = 0;
  }

  function makeBallMesh(success) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 16, 14),
      new THREE.MeshStandardMaterial({
        color: success ? 0xff6a57 : 0xf2f4f7,
        roughness: 0.52, metalness: 0.12,
      }),
    );
    mesh.castShadow = true;
    return mesh;
  }

  const spinnerMat = new THREE.MeshStandardMaterial({ color: 0x4499cc, roughness: 0.35, metalness: 0.5 });
  const SPINNER_THICK = 0.09;  // visual thickness (matches physics half*2)

  function startTrial() {
    clearTrial();

    const population = Math.max(1, state.params.population || 1);
    const successes  = Math.max(0, Math.min(population, state.params.successes || 0));

    const ids        = shuffle(Array.from({ length: population }, (_, i) => i + 1));
    const successIds = new Set(ids.slice(0, successes));

    rs.physics = createPachinkoDrawPhysics({ population, successIds });

    // Build spinner visual meshes
    rs.physics.SPINNER_DEFS.forEach((def, idx) => {
      const [x, y, , hLen, hDep] = def;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hLen * 2, SPINNER_THICK, hDep * 2),
        spinnerMat,
      );
      mesh.position.set(x, y, 0);
      boardGroup.add(mesh);
      spinnerMeshes.push({ mesh, rb: rs.physics.spinnerBodies[idx].rb });
    });

    // Build ball meshes
    for (const ball of rs.physics.balls) {
      const mesh = makeBallMesh(ball.success);
      const p    = ball.rb.translation();
      mesh.position.set(p.x, p.y, p.z);
      boardGroup.add(mesh);
      ballEntries.set(ball.id, { ball, mesh });
    }
  }

  // ── public API ────────────────────────────────────────────────────────────

  function reset(kind, startImmediately = false) {
    rs.mode            = kind;
    rs.withReplacement = kind === 'pachinko-draw-replace';
    rs.running         = startImmediately;
    rs.paused          = false;
    rs.complete        = false;
    rs.trialIndex      = 0;

    const population = Math.max(1, state.params.population || 1);
    const successes  = Math.max(0, Math.min(population, state.params.successes || 0));
    rs.draws          = Math.max(1, Math.min(population, state.params.draws || 1));
    state.bins        = Array.from({ length: rs.draws + 1 }, () => 0);
    state.samples     = [];

    if (rs.withReplacement) {
      const p = successes / population;
      state.theoretical = normalizeWeights(
        Array.from({ length: rs.draws + 1 }, (_, k) => binomialPmf(rs.draws, k, p)),
        state.params.samples,
      );
    } else {
      state.theoretical = normalizeWeights(
        Array.from({ length: rs.draws + 1 }, (_, k) =>
          hypergeometricPmf(population, successes, rs.draws, k),
        ),
        state.params.samples,
      );
    }

    rs.total      = state.params.samples;
    state.paused  = false;
    state.threeScene = rs;

    startTrial();
    if (!startImmediately) rs.running = false;
  }

  function setPaused(paused) {
    rs.paused    = paused;
    state.paused = paused;
  }

  function step(dtMs) {
    if (!rs.running || rs.paused || rs.complete || !rs.physics) return;

    const dtSec = Math.max(1 / 240, Math.min(dtMs / 1000, 1 / 60));

    // Advance physics — get balls that just exited
    const newExits = rs.physics.step(dtSec);

    for (const ball of newExits) {
      if (rs.drawsDone >= rs.draws) break;
      rs.drawsDone++;
      if (ball.success) rs.drawnSuccesses++;

      const entry = ballEntries.get(ball.id);
      if (entry) {
        const { mesh } = entry;
        boardGroup.remove(mesh);
        scene.add(mesh);
        rs.escapedBalls.push({
          mesh,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 1.4,
            -(1.2 + Math.random() * 1.2),
            (Math.random() - 0.5) * 0.9,
          ),
        });
        ballEntries.delete(ball.id);
      }
    }

    // Sync ball meshes to physics positions
    for (const { ball, mesh } of ballEntries.values()) {
      if (ball.rb && !ball.removed) {
        const p = ball.rb.translation();
        const r = ball.rb.rotation();
        mesh.position.set(p.x, p.y, p.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }

    // Sync spinner mesh rotations from physics
    for (const { mesh, rb } of spinnerMeshes) {
      const r = rb.rotation();
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    // Gravity-settle escaped balls
    rs.escapedBalls.forEach(e => {
      e.vel.y -= 9.0 * dtSec;
      e.mesh.position.addScaledVector(e.vel, dtSec);
      e.mesh.rotation.x += dtSec * 1.4;
      if (e.mesh.position.y < -12) { disposeMesh(e.mesh); e.dead = true; }
    });
    rs.escapedBalls = rs.escapedBalls.filter(e => !e.dead);

    // Trial done when enough balls drawn
    if (rs.drawsDone >= rs.draws) {
      state.bins[rs.drawnSuccesses]++;
      state.samples.push(rs.drawnSuccesses);
      rs.trialIndex++;

      if (rs.trialIndex >= rs.total) {
        rs.complete = true;
        rs.running  = false;
        return;
      }
      startTrial();
    }
  }

  function render(width, height) {
    if (!canvas) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width  = width;
      canvas.height = height;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  return {
    reset,
    step,
    render,
    setPaused,
    get complete() { return rs.complete; },
  };
}
