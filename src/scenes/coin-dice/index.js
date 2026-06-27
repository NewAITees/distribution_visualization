import { createThreeRuntime, createThreeRenderer } from "../../three/runtime.js";
import { binomialPmf, normalizeWeights } from "../../core/math.js";

const rapierModule = await import("../../../node_modules/@dimforge/rapier3d-compat/rapier_wasm3d.js");
const RAPIER = rapierModule.default ?? rapierModule;
await RAPIER.init({});

function rotateVec(q, v) {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}

function randomUnitQuat() {
  const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
  const sq1 = Math.sqrt(1 - u1), sq2 = Math.sqrt(u1);
  return { x: sq1 * Math.sin(2 * Math.PI * u2), y: sq1 * Math.cos(2 * Math.PI * u2), z: sq2 * Math.sin(2 * Math.PI * u3), w: sq2 * Math.cos(2 * Math.PI * u3) };
}

function isSettled(rb) {
  const lv = rb.linvel(), av = rb.angvel();
  return (lv.x ** 2 + lv.y ** 2 + lv.z ** 2) < 0.1 ** 2 && (av.x ** 2 + av.y ** 2 + av.z ** 2) < 0.4 ** 2;
}

const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

function getCoinResult(rb) {
  const [, wy] = rotateVec(rb.rotation(), [0, 1, 0]);
  return wy > 0 ? 1 : 0;
}

function getDieResult(rb, sides) {
  if (sides !== 6) return Math.floor(Math.random() * sides);
  const q = rb.rotation();
  let maxDot = -Infinity, result = 0;
  for (let i = 0; i < FACE_NORMALS.length; i++) {
    const [, wy] = rotateVec(q, FACE_NORMALS[i]);
    if (wy > maxDot) { maxDot = wy; result = i; }
  }
  return result;
}

function createPhysicsWorld(mode, sides, startX, startZ) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.numSolverIterations = 8;

  // Floor surface at y=-2.7 (matches Three.js visual floor)
  const floorRb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -2.75, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(8, 0.05, 8).setFriction(0.65).setRestitution(0.22), floorRb);

  let colliderDesc;
  let angDamp, angScale;
  if (mode === "dice") {
    if (sides === 6) {
      colliderDesc = RAPIER.ColliderDesc.cuboid(0.6, 0.6, 0.6).setFriction(0.7).setRestitution(0.18).setDensity(1.5);
      angDamp = 0.6;
      angScale = 12;
    } else {
      colliderDesc = RAPIER.ColliderDesc.cylinder(0.6, 0.8).setFriction(0.65).setRestitution(0.18).setDensity(1.5);
      angDamp = 0.5;
      angScale = 10;
    }
  } else {
    // Coin: cylinder matching CylinderGeometry(1.0, 1.0, 0.18)
    colliderDesc = RAPIER.ColliderDesc.cylinder(0.09, 1.0).setFriction(0.6).setRestitution(0.18).setDensity(6.0);
    angDamp = 0.8;
    angScale = 20;
  }

  // Octagonal containment walls (invisible — physics only)
  const WALL_R = 3.5;
  const WALL_PANELS = 8;
  const WALL_CENTER_Y = 3.4; // midpoint between spawn (9.5) and floor (-2.7)
  const WALL_HALF_H = 6.2;
  const WALL_HALF_W = WALL_R * Math.tan(Math.PI / WALL_PANELS) + 0.1;
  for (let i = 0; i < WALL_PANELS; i++) {
    const angle = (i / WALL_PANELS) * Math.PI * 2;
    const wx = WALL_R * Math.cos(angle);
    const wz = WALL_R * Math.sin(angle);
    const half = angle / 2;
    const wallBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(wx, WALL_CENTER_Y, wz)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.08, WALL_HALF_H, WALL_HALF_W).setFriction(0.25).setRestitution(0.5),
      wallBody,
    );
  }

  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startX, 9.5, startZ)
      .setLinearDamping(0.05)
      .setAngularDamping(angDamp),
  );
  world.createCollider(colliderDesc, rb);
  rb.setRotation(randomUnitQuat(), true);
  // Minimal Y-spin so flat coins don't spin invisibly forever
  rb.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: -1.0, z: (Math.random() - 0.5) * 1.5 }, true);
  rb.setAngvel({ x: (Math.random() - 0.5) * angScale, y: (Math.random() - 0.5) * angScale * 0.15, z: (Math.random() - 0.5) * angScale }, true);

  return { world, rb };
}

export function createCoinDiceScene({ canvas, state }) {
  const runtime = createThreeRuntime();
  const { THREE, scene, camera, boardGroup } = runtime;
  const renderer = createThreeRenderer(canvas);

  scene.fog = new THREE.Fog(0x09111d, 12, 34);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x10263b, roughness: 0.95, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.7;
  boardGroup.add(floor);

  const grid = new THREE.GridHelper(30, 24, 0x27506e, 0x163247);
  grid.position.y = -2.69;
  boardGroup.add(grid);

  const lightRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.2, 0.06, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0xf5b942, emissive: 0x402000, emissiveIntensity: 0.35 }),
  );
  lightRing.rotation.x = Math.PI / 2;
  lightRing.position.set(0, 2.2, -3.2);
  boardGroup.add(lightRing);

  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(4, 8, 10);
  scene.add(key);

  const fill = new THREE.PointLight(0x66ccff, 1.2, 50);
  fill.position.set(-6, 3, 8);
  scene.add(fill);

  const tosses = [];

  const runtimeState = {
    mode: "bernoulli",
    running: false,
    paused: false,
    total: 0,
    spawned: 0,
    settled: 0,
    completed: 0,
    spawnTimer: 0,
    spawnInterval: 140,
    complete: false,
    active: null,
    queue: [],
    biasP: 0.5,
    trialSize: 1,
    maxTries: 1,
    maxFailures: 1,
    successesNeeded: 1,
  };

  function clearTosses() {
    while (tosses.length) {
      const toss = tosses.pop();
      boardGroup.remove(toss.mesh);
      toss.mesh.geometry.dispose();
      const mats = Array.isArray(toss.mesh.material) ? toss.mesh.material : [toss.mesh.material];
      for (const m of mats) { m.map?.dispose(); m.dispose(); }
      if (typeof toss.rapierWorld?.free === "function") toss.rapierWorld.free();
    }
    runtimeState.active = null;
  }

  function setKind(kind) {
    runtimeState.mode = kind;
    camera.position.set(0, 6.0, 17);
    camera.lookAt(0, 1.5, 0);
  }

  function buildCoinMesh() {
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xf5d36f, roughness: 0.3, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.18, metalness: 0.88, emissive: 0x332200, emissiveIntensity: 0.18 }), // 表: 明るい金
      new THREE.MeshStandardMaterial({ color: 0xc8c8d4, roughness: 0.22, metalness: 0.92 }), // 裏: シルバー
    ];
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.18, 40), materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function makePipTexture(value) {
    const S = 128;
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5f0e8";
    ctx.beginPath();
    ctx.roundRect(4, 4, S - 8, S - 8, 14);
    ctx.fill();
    ctx.fillStyle = "#1a1a2e";
    const pips = {
      1: [[0.5, 0.5]],
      2: [[0.3, 0.3], [0.7, 0.7]],
      3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
      4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
      5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
      6: [[0.3, 0.25], [0.7, 0.25], [0.3, 0.5], [0.7, 0.5], [0.3, 0.75], [0.7, 0.75]],
    }[value] ?? [[0.5, 0.5]];
    for (const [px, py] of pips) {
      ctx.beginPath();
      ctx.arc(px * S, py * S, S * 0.095, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }

  function buildDiceMesh(sides) {
    if (sides === 10) {
      const material = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.65, metalness: 0.02 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.2, 10, 1, false), material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      return mesh;
    }
    // BoxGeometry face order: +X(0) -X(1) +Y(2) -Y(3) +Z(4) -Z(5)
    // Rapier FACE_NORMALS[i] maps to Three.js material[i], so result i = pip i+1
    const faceValues = [1, 2, 3, 4, 5, 6]; // material index → pip value
    const materials = faceValues.map((v) =>
      new THREE.MeshStandardMaterial({ map: makePipTexture(v), roughness: 0.55, metalness: 0.04 }),
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), materials);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function createTrial(id) {
    return {
      id,
      tosses: 0,
      successes: 0,
      active: false,
      finished: false,
      result: null,
    };
  }

  function trialLimit() {
    switch (runtimeState.mode) {
      case "bernoulli":
        return 1;
      case "binom":
        return runtimeState.trialSize;
      case "geometric":
        return runtimeState.maxTries;
      case "negbinom":
        return runtimeState.maxFailures;
      default:
        return 1;
    }
  }

  function collectTrialResult(trial, tossResult) {
    switch (runtimeState.mode) {
      case "bernoulli":
        trial.result = tossResult;
        trial.finished = true;
        return true;
      case "binom":
        trial.tosses += 1;
        trial.successes += tossResult;
        if (trial.tosses >= runtimeState.trialSize) {
          trial.result = trial.successes;
          trial.finished = true;
          return true;
        }
        return false;
      case "geometric":
        trial.tosses += 1;
        if (tossResult === 1) {
          trial.result = trial.tosses - 1;
          trial.finished = true;
          return true;
        }
        if (trial.tosses >= runtimeState.maxTries) {
          trial.result = runtimeState.maxTries;
          trial.finished = true;
          return true;
        }
        return false;
      case "negbinom":
        trial.tosses += 1;
        if (tossResult === 1) trial.successes += 1;
        if (trial.successes >= runtimeState.successesNeeded) {
          trial.result = trial.tosses - trial.successes;
          trial.finished = true;
          return true;
        }
        if (trial.tosses >= runtimeState.maxFailures) {
          trial.result = trial.tosses - trial.successes;
          trial.finished = true;
          return true;
        }
        return false;
      default:
        trial.result = tossResult;
        trial.finished = true;
        return true;
    }
  }

  function spawnThrow() {
    if (!runtimeState.queue.length) return;
    const trial = runtimeState.queue.shift();
    if (!trial || trial.active || trial.finished) return;

    const mode = runtimeState.mode;
    const sides = mode === "dice" ? runtimeState.sides : 2;
    const startX = (Math.random() - 0.5) * 1.0;
    const startZ = (Math.random() - 0.5) * 1.0;
    const mesh = mode === "dice" ? buildDiceMesh(sides) : buildCoinMesh();
    boardGroup.add(mesh);

    const { world, rb } = createPhysicsWorld(mode, sides, startX, startZ);
    // Sync initial mesh pose from Rapier body
    const initPos = rb.translation();
    const initQ = rb.rotation();
    mesh.position.set(initPos.x, initPos.y, initPos.z);
    mesh.quaternion.set(initQ.x, initQ.y, initQ.z, initQ.w);

    const toss = {
      mesh,
      mode,
      trial,
      rapierWorld: world,
      rapierRb: rb,
      settled: false,
      settledAt: -1,
      settledCount: 0,
      age: 0,
    };

    tosses.push(toss);
    runtimeState.active = toss;
    trial.active = true;
    if (trial.tosses === 0) runtimeState.spawned += 1;
  }

  function reset(kind, startImmediately = false) {
    setKind(kind);
    clearTosses();
    runtimeState.running = startImmediately;
    runtimeState.paused = false;
    runtimeState.mode = kind;
    runtimeState.sides = runtimeState.mode === "dice" ? Math.max(6, state.params.sides || 6) : 2;
    runtimeState.trialSize = runtimeState.mode === "binom"
      ? Math.max(1, state.params.trials || 1)
      : 1;
    runtimeState.maxTries = runtimeState.mode === "geometric" ? Math.max(1, state.params.maxTries || 1) : 1;
    runtimeState.maxFailures = runtimeState.mode === "negbinom" ? Math.max(1, state.params.maxFailures || 1) : 1;
    runtimeState.successesNeeded = runtimeState.mode === "negbinom" ? Math.max(1, state.params.successesNeeded || 1) : 1;
    runtimeState.biasP = state.params.p ?? 0.5;
    runtimeState.total = state.params.samples;
    runtimeState.spawned = 0;
    runtimeState.settled = 0;
    runtimeState.completed = 0;
    runtimeState.spawnTimer = 0;
    const estimatedTosses = Math.max(1, runtimeState.total * trialLimit());
    runtimeState.spawnInterval = Math.max(16, Math.min(110, Math.round(4200 / estimatedTosses)));
    runtimeState.complete = false;
    runtimeState.active = null;
    runtimeState.queue = Array.from({ length: runtimeState.total }, (_, index) => createTrial(index));
    state.bins = Array.from(
      {
        length:
          runtimeState.mode === "bernoulli" ? 2
          : runtimeState.mode === "binom" ? runtimeState.trialSize + 1
          : runtimeState.mode === "geometric" ? runtimeState.maxTries + 1
          : runtimeState.mode === "negbinom" ? runtimeState.maxFailures + 1
          : runtimeState.sides,
      },
      () => 0,
    );
    state.samples = [];
    if (runtimeState.mode === "bernoulli") {
      state.theoretical = normalizeWeights([1 - runtimeState.biasP, runtimeState.biasP], state.params.samples);
    } else if (runtimeState.mode === "binom") {
      state.theoretical = normalizeWeights(
        Array.from({ length: runtimeState.trialSize + 1 }, (_, index) => binomialPmf(runtimeState.trialSize, index, runtimeState.biasP)),
        state.params.samples,
      );
    } else if (runtimeState.mode === "geometric") {
      const weights = [];
      for (let k = 0; k < runtimeState.maxTries; k += 1) {
        weights.push(((1 - runtimeState.biasP) ** k) * runtimeState.biasP);
      }
      weights.push((1 - runtimeState.biasP) ** runtimeState.maxTries);
      state.theoretical = normalizeWeights(weights, state.params.samples);
    } else if (runtimeState.mode === "negbinom") {
      const weights = [];
      for (let k = 0; k < runtimeState.maxFailures; k += 1) {
        weights.push(binomialPmf(k + runtimeState.successesNeeded - 1, k, 1 - runtimeState.biasP));
      }
      weights.push(Math.max(0, 1 - weights.reduce((sum, value) => sum + value, 0)));
      state.theoretical = normalizeWeights(weights, state.params.samples);
    } else {
      state.theoretical = normalizeWeights(Array.from({ length: runtimeState.sides }, () => 1), state.params.samples);
    }
    state.paused = false;
    state.threeScene = runtimeState;
    if (startImmediately) spawnThrow();
  }

  function setPaused(paused) {
    runtimeState.paused = paused;
    state.paused = paused;
  }

  function settleToss(toss, resultIndex) {
    if (toss.settled) return;
    toss.settled = true;
    toss.settledAt = performance.now();
    runtimeState.settled += 1;
    if (runtimeState.active === toss) runtimeState.active = null;
    const trial = toss.trial;
    trial.active = false;

    const isDone = collectTrialResult(trial, resultIndex);
    if (isDone) {
      const bin = Math.max(0, Math.min(state.bins.length - 1, trial.result ?? 0));
      state.bins[bin] += 1;
      state.samples.push(trial.result ?? 0);
      runtimeState.completed += 1;
    } else {
      runtimeState.queue.unshift(trial); // re-queue at front so trial completes sequentially
    }

    if (runtimeState.completed >= runtimeState.total && runtimeState.queue.length === 0 && tosses.every((item) => item.settled)) {
      runtimeState.complete = true;
    }
  }

  function step(dtMs) {
    if (!runtimeState.running || runtimeState.paused || runtimeState.complete) return;

    const SUB_STEPS = 8; // simulate 8x faster than real-time
    tosses.forEach((toss) => {
      if (toss.settled) return;
      let justSettled = false;
      for (let i = 0; i < SUB_STEPS; i++) {
        toss.rapierWorld.step();
        if (isSettled(toss.rapierRb)) {
          toss.settledCount++;
          if (toss.settledCount >= 6) { justSettled = true; break; }
        } else {
          toss.settledCount = 0;
        }
      }
      const pos = toss.rapierRb.translation();
      const q = toss.rapierRb.rotation();
      toss.mesh.position.set(pos.x, pos.y, pos.z);
      toss.mesh.quaternion.set(q.x, q.y, q.z, q.w);

      toss.age += dtMs / 1000;
      if (justSettled || (!toss.settled && toss.age > 8.0)) {
        const result = toss.mode === "dice"
          ? getDieResult(toss.rapierRb, runtimeState.sides)
          : getCoinResult(toss.rapierRb);
        settleToss(toss, result);
      }
    });

    // settled から 300ms 経過したら削除
    for (let i = tosses.length - 1; i >= 0; i--) {
      const t = tosses[i];
      if (t.settled && performance.now() - t.settledAt > 300) {
        boardGroup.remove(t.mesh);
        t.mesh.geometry.dispose();
        const mats = Array.isArray(t.mesh.material) ? t.mesh.material : [t.mesh.material];
        for (const m of mats) { m.map?.dispose(); m.dispose(); }
        if (typeof t.rapierWorld?.free === "function") t.rapierWorld.free();
        tosses.splice(i, 1);
      }
    }

    if (runtimeState.active == null && runtimeState.queue.length && runtimeState.running) {
      spawnThrow();
    }

    if (runtimeState.completed >= runtimeState.total && runtimeState.queue.length === 0 && tosses.every((item) => item.settled) && !runtimeState.complete) {
      runtimeState.complete = true;
    }
  }

  function render(width, height) {
    if (!canvas) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
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
    get complete() {
      return runtimeState.complete;
    },
  };
}
