import { createThreeRuntime, createThreeRenderer } from "../../three/runtime.js";
import { binomialPmf, normalizeWeights } from "../../core/math.js";

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
      toss.mesh.material.forEach?.((m) => m.dispose?.());
      if (toss.mesh.material.dispose) toss.mesh.material.dispose();
    }
    runtimeState.active = null;
  }

  function setKind(kind) {
    runtimeState.mode = kind;
    if (kind === "walk") {
      camera.position.set(0, 5.1, 15);
    } else {
      camera.position.set(0, 4.8, 13.5);
    }
    camera.lookAt(0, 0, 0);
  }

  function buildCoinMesh() {
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xf5d36f, roughness: 0.3, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xb78120, roughness: 0.45, metalness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0xf1c24e, roughness: 0.3, metalness: 0.7 }),
    ];
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.18, 40), materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildDiceMesh(sides) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xf6f2ea,
      roughness: 0.65,
      metalness: 0.02,
    });
    const geometry = sides === 10
      ? new THREE.CylinderGeometry(1.0, 1.0, 1.2, 10, 1, false)
      : new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function dieTopRotation(value, sides) {
    if (sides === 10) {
      return new THREE.Euler((value % 5) * (Math.PI / 5), ((value + 1) % 3) * (Math.PI / 2), 0);
    }
    switch (value) {
      case 1: return new THREE.Euler(0, 0, 0);
      case 2: return new THREE.Euler(Math.PI / 2, 0, 0);
      case 3: return new THREE.Euler(0, 0, Math.PI / 2);
      case 4: return new THREE.Euler(0, 0, -Math.PI / 2);
      case 5: return new THREE.Euler(-Math.PI / 2, 0, 0);
      case 6: return new THREE.Euler(Math.PI, 0, 0);
      default: return new THREE.Euler(0, 0, 0);
    }
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
      case "walk":
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
      case "walk":
        trial.tosses += 1;
        trial.successes += tossResult;
        if (trial.tosses >= runtimeState.trialSize) {
          trial.result = trial.successes;
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
    const mesh = mode === "dice" ? buildDiceMesh(sides) : buildCoinMesh();
    mesh.position.set((Math.random() - 0.5) * 0.8, 5.2, (Math.random() - 0.5) * 0.8);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    boardGroup.add(mesh);

    const tossResult = mode === "dice"
      ? Math.floor(Math.random() * sides)
      : (Math.random() < (runtimeState.biasP ?? 0.5) ? 1 : 0);
    const target = mode === "dice"
      ? { rot: dieTopRotation(tossResult + 1, sides), label: tossResult }
      : { rot: new THREE.Euler(tossResult === 1 ? 0 : Math.PI, 0, Math.random() * Math.PI * 2), label: tossResult };

    const toss = {
      mesh,
      kind: mode,
      mode,
      resultIndex: tossResult,
      trial,
      target,
      age: 0,
      life: mode === "dice" ? 0.95 : 0.68,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 1.8, 0, (Math.random() - 0.5) * 1.8),
      angular: new THREE.Vector3(
        (Math.random() * 2 + 1) * (Math.random() < 0.5 ? -1 : 1),
        (Math.random() * 2 + 1) * (Math.random() < 0.5 ? -1 : 1),
        (Math.random() * 2 + 1) * (Math.random() < 0.5 ? -1 : 1),
      ),
      settled: false,
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
    runtimeState.trialSize = runtimeState.mode === "binom" || runtimeState.mode === "walk"
      ? Math.max(1, state.params.trials || state.params.steps || 1)
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
          : runtimeState.mode === "binom" || runtimeState.mode === "walk" ? runtimeState.trialSize + 1
          : runtimeState.mode === "geometric" ? runtimeState.maxTries + 1
          : runtimeState.mode === "negbinom" ? runtimeState.maxFailures + 1
          : runtimeState.sides,
      },
      () => 0,
    );
    state.samples = [];
    if (runtimeState.mode === "bernoulli") {
      state.theoretical = normalizeWeights([1 - runtimeState.biasP, runtimeState.biasP], state.params.samples);
    } else if (runtimeState.mode === "binom" || runtimeState.mode === "walk") {
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

  function settleToss(toss) {
    if (toss.settled) return;
    toss.settled = true;
    toss.mesh.rotation.copy(toss.target.rot);
    toss.mesh.position.y = -1.92;
    runtimeState.settled += 1;
    boardGroup.remove(toss.mesh);
    toss.mesh.geometry.dispose();
    if (Array.isArray(toss.mesh.material)) {
      toss.mesh.material.forEach((material) => material.dispose());
    } else if (toss.mesh.material?.dispose) {
      toss.mesh.material.dispose();
    }
    if (runtimeState.active === toss) {
      runtimeState.active = null;
    }
    const trial = toss.trial;
    trial.active = false;

    const isDone = collectTrialResult(trial, toss.resultIndex);
    if (isDone) {
      const bin = Math.max(0, Math.min(state.bins.length - 1, trial.result ?? 0));
      state.bins[bin] += 1;
      state.samples.push(trial.result ?? 0);
      runtimeState.completed += 1;
    } else {
      runtimeState.queue.push(trial);
    }

    if (runtimeState.completed >= runtimeState.total && runtimeState.queue.length === 0 && tosses.every((item) => item.settled)) {
      runtimeState.complete = true;
    }
  }

  function step(dtMs) {
    if (!runtimeState.running || runtimeState.paused || runtimeState.complete) return;

    runtimeState.spawnTimer += dtMs;
    while (runtimeState.spawnTimer >= runtimeState.spawnInterval && runtimeState.queue.length) {
      runtimeState.spawnTimer -= runtimeState.spawnInterval;
      spawnThrow();
    }

    const dt = dtMs / 1000;
    tosses.forEach((toss) => {
      if (toss.settled) return;
      toss.age += dt;
      toss.velocity.y -= 11.5 * dt;
      toss.mesh.position.addScaledVector(toss.velocity, dt);
      toss.mesh.rotation.x += toss.angular.x * dt;
      toss.mesh.rotation.y += toss.angular.y * dt;
      toss.mesh.rotation.z += toss.angular.z * dt;

      if (toss.mesh.position.y <= -1.92) {
        toss.mesh.position.y = -1.92;
        toss.velocity.multiplyScalar(0.28);
        toss.velocity.x *= 0.76;
        toss.velocity.z *= 0.76;
        toss.angular.multiplyScalar(0.65);
      }

      if (toss.age >= toss.life || (toss.mesh.position.y <= -1.92 && toss.velocity.length() < 0.55)) {
        settleToss(toss);
      }
    });

    for (let i = tosses.length - 1; i >= 0; i--) {
      if (tosses[i].settled) tosses.splice(i, 1);
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
