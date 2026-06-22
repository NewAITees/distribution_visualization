import { createThreeRuntime, createThreeRenderer } from "../../three/runtime.js";
import { createBingoPhysics } from "./physics.js";
import { hypergeometricPmf, normalizeWeights } from "../../core/math.js";

function shuffle(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function makeBallMesh(THREE, success) {
  const material = new THREE.MeshStandardMaterial({
    color: success ? 0xff6a57 : 0xf2f4f7,
    roughness: 0.52,
    metalness: 0.12,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createBingoMachineScene({ canvas, state }) {
  const runtime = createThreeRuntime();
  const { THREE, scene, camera, boardGroup } = runtime;
  const renderer = createThreeRenderer(canvas);

  scene.fog = new THREE.Fog(0x08131d, 12, 42);
  camera.position.set(0, 5.4, 16.0);
  camera.lookAt(0, 0, 0);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 52),
    new THREE.MeshStandardMaterial({ color: 0x0f2133, roughness: 0.98, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.4;
  boardGroup.add(floor);

  const grid = new THREE.GridHelper(40, 28, 0x274e6d, 0x173247);
  grid.position.y = -4.39;
  boardGroup.add(grid);

  const drum = new THREE.Group();
  boardGroup.add(drum);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 28, 22),
    new THREE.MeshStandardMaterial({
      color: 0x8bc8ff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.12,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  drum.add(shell);

  const shellWire = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 24, 18),
    new THREE.MeshStandardMaterial({
      color: 0xd8f0ff,
      transparent: true,
      opacity: 0.08,
      wireframe: true,
      roughness: 0.1,
      metalness: 0.05,
    }),
  );
  drum.add(shellWire);

  const outlet = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.95, 0.78),
    new THREE.MeshStandardMaterial({ color: 0x09111d, transparent: true, opacity: 0.74 }),
  );
  outlet.position.set(0, -3.06, 0);
  drum.add(outlet);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.08, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0xd4f0ff, emissive: 0x163247, emissiveIntensity: 0.18 }),
  );
  ring.rotation.x = Math.PI / 2;
  drum.add(ring);

  const support = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 7.8, 14),
    new THREE.MeshStandardMaterial({ color: 0x344d67, roughness: 0.92, metalness: 0.1 }),
  );
  support.rotation.z = Math.PI / 2;
  drum.add(support);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-5, 8, 9);
  scene.add(key);
  const fill = new THREE.PointLight(0x84c6ff, 1.0, 40);
  fill.position.set(4, 4, 8);
  scene.add(fill);

  const physics = createBingoPhysics({
    cageRadius: 3.1,
    ballRadius: 0.22,
    releaseY: -2.2,
    releaseZ: 0.55,
    releaseX: 0.95,
  });

  const runtimeState = {
    mode: "hypergeom",
    running: false,
    paused: false,
    complete: false,
    total: 0,
    trialIndex: 0,
    currentTrial: null,
    spinSpeed: 0.95,
    escapedBalls: [],
  };

  function clearCurrentTrial() {
    if (runtimeState.currentTrial) {
      runtimeState.currentTrial.balls.forEach((ball) => {
        if (ball.mesh.parent) {
          ball.mesh.parent.remove(ball.mesh);
        }
        ball.mesh.geometry.dispose();
        if (Array.isArray(ball.mesh.material)) {
          ball.mesh.material.forEach((material) => material.dispose());
        } else {
          ball.mesh.material.dispose();
        }
      });
    }
    physics.clear();
    runtimeState.escapedBalls.forEach((ball) => {
      scene.remove(ball.mesh);
      ball.mesh.geometry.dispose();
      if (Array.isArray(ball.mesh.material)) {
        ball.mesh.material.forEach((material) => material.dispose());
      } else {
        ball.mesh.material.dispose();
      }
    });
    runtimeState.escapedBalls = [];
  }

  function buildTrial() {
    const population = Math.max(1, state.params.population || 1);
    const successes = Math.max(0, Math.min(population, state.params.successes || 0));
    const draws = Math.max(1, Math.min(population, state.params.draws || 1));
    const values = shuffle([
      ...Array.from({ length: successes }, () => 1),
      ...Array.from({ length: population - successes }, () => 0),
    ]);

    return {
      population,
      successes,
      draws,
      values,
      balls: [],
      drawnSuccesses: 0,
      drawsDone: 0,
      finished: false,
    };
  }

  function populateTrial(trial) {
    clearCurrentTrial();
    const ballCount = trial.values.length;
    const radius = 2.55;
    for (let i = 0; i < ballCount; i += 1) {
      const success = !!trial.values[i];
      const mesh = makeBallMesh(THREE, success);
      const theta = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * radius;
      const x = Math.cos(theta) * rr;
      const y = (Math.random() - 0.5) * 4.8;
      const z = Math.sin(theta) * rr;
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      drum.add(mesh);

      const body = {
        success,
        mesh,
        position: mesh.position,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
        ),
        radius: 0.22,
        mass: 1,
        released: false,
      };
      trial.balls.push(body);
      physics.addBall(body);
    }
  }

  function startTrial(index) {
    runtimeState.trialIndex = index;
    runtimeState.currentTrial = buildTrial();
    populateTrial(runtimeState.currentTrial);
    runtimeState.spinSpeed = 0.9 + Math.random() * 0.35;
  }

  function promoteReleasedBall(ball) {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    ball.mesh.getWorldPosition(worldPos);
    ball.mesh.getWorldQuaternion(worldQuat);
    drum.remove(ball.mesh);
    scene.add(ball.mesh);
    ball.mesh.position.copy(worldPos);
    ball.mesh.quaternion.copy(worldQuat);
    runtimeState.escapedBalls.push({
      mesh: ball.mesh,
      velocity: ball.velocity.clone().multiplyScalar(0.65).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, -0.22, (Math.random() - 0.5) * 0.25)),
    });
  }

  function finishTrial() {
    const trial = runtimeState.currentTrial;
    if (!trial || trial.finished) return;
    trial.finished = true;
    state.bins[trial.drawnSuccesses] += 1;
    state.samples.push(trial.drawnSuccesses);

    runtimeState.trialIndex += 1;
    if (runtimeState.trialIndex >= runtimeState.total) {
      runtimeState.complete = true;
      return;
    }
    startTrial(runtimeState.trialIndex);
  }

  function reset(kind, startImmediately = false) {
    runtimeState.mode = kind;
    runtimeState.running = startImmediately;
    runtimeState.paused = false;
    runtimeState.complete = false;
    runtimeState.total = state.params.samples;
    runtimeState.trialIndex = 0;
    runtimeState.escapedBalls = [];
    runtimeState.spinSpeed = 1.0;

    const draws = Math.max(1, Math.min(state.params.population || 1, state.params.draws || 1));
    state.bins = Array.from({ length: draws + 1 }, () => 0);
    state.samples = [];
    state.theoretical = normalizeWeights(
      Array.from({ length: draws + 1 }, (_, index) =>
        hypergeometricPmf(state.params.population, state.params.successes, state.params.draws, index),
      ),
      state.params.samples,
    );
    state.paused = false;
    state.threeScene = runtimeState;
    startTrial(0);
    if (!startImmediately) runtimeState.running = false;
  }

  function setPaused(paused) {
    runtimeState.paused = paused;
    state.paused = paused;
  }

  function settleEscapedBalls(dt) {
    runtimeState.escapedBalls.forEach((ball) => {
      ball.velocity.y -= 8.6 * dt;
      ball.mesh.position.addScaledVector(ball.velocity, dt);
      ball.mesh.rotation.x += dt * 1.2;
      ball.mesh.rotation.y += dt * 1.6;
      if (ball.mesh.position.y < -8.0) {
        scene.remove(ball.mesh);
        ball.mesh.geometry.dispose();
        if (Array.isArray(ball.mesh.material)) {
          ball.mesh.material.forEach((material) => material.dispose());
        } else {
          ball.mesh.material.dispose();
        }
        ball.dead = true;
      }
    });
    runtimeState.escapedBalls = runtimeState.escapedBalls.filter((ball) => !ball.dead);
  }

  function step(dtMs) {
    if (!runtimeState.running || runtimeState.paused || runtimeState.complete) return;

    const dt = dtMs / 1000;
    drum.rotation.x += runtimeState.spinSpeed * dt;
    ring.rotation.z += dt * 0.35;

    const trial = runtimeState.currentTrial;
    const remainingDraws = trial ? Math.max(0, trial.draws - trial.drawsDone) : 0;
    const released = physics.step(dt, drum.rotation.x, Math.min(1, remainingDraws));
    released.forEach((ball) => {
      if (!trial || trial.finished) return;
      trial.drawsDone += 1;
      if (ball.success) trial.drawnSuccesses += 1;
      promoteReleasedBall(ball);
    });

    settleEscapedBalls(dt);

    if (trial && trial.drawsDone >= trial.draws) {
      finishTrial();
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
