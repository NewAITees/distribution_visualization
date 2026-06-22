import { createThreeRuntime, createThreeRenderer } from "../../three/runtime.js";
import { normalizeWeights } from "../../core/math.js";

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
  const clock = new THREE.Clock(false);

  const runtimeState = {
    kind: "coin",
    sides: 2,
    running: false,
    paused: false,
    total: 0,
    spawned: 0,
    settled: 0,
    spawnTimer: 0,
    spawnInterval: 140,
    complete: false,
    active: null,
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
    runtimeState.kind = kind;
    camera.position.set(0, 4.8, 13.5);
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

  function spawnThrow() {
    if (runtimeState.spawned >= runtimeState.total) return;

    const kind = runtimeState.kind;
    const sides = kind === "coin" ? 2 : runtimeState.sides;
    const mesh = kind === "coin" ? buildCoinMesh() : buildDiceMesh(sides);
    mesh.position.set((Math.random() - 0.5) * 0.8, 5.2, (Math.random() - 0.5) * 0.8);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    boardGroup.add(mesh);

    const resultIndex = kind === "coin"
      ? (Math.random() < 0.5 ? 0 : 1)
      : Math.floor(Math.random() * sides);

    const target = kind === "coin"
      ? { rot: new THREE.Euler(resultIndex === 0 ? 0 : Math.PI, 0, Math.random() * Math.PI * 2), label: resultIndex }
      : { rot: dieTopRotation(resultIndex + 1, sides), label: resultIndex };

    const toss = {
      mesh,
      kind,
      resultIndex,
      target,
      age: 0,
      life: kind === "coin" ? 0.75 : 0.95,
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
    runtimeState.spawned += 1;
  }

  function reset(kind, startImmediately = false) {
    setKind(kind);
    clearTosses();
    runtimeState.running = startImmediately;
    runtimeState.paused = false;
    runtimeState.total = state.params.samples;
    runtimeState.sides = kind === "coin" ? 2 : Math.max(6, state.params.sides || 6);
    runtimeState.spawned = 0;
    runtimeState.settled = 0;
    runtimeState.spawnTimer = 0;
    runtimeState.spawnInterval = Math.max(20, Math.min(120, Math.round(5000 / Math.max(state.params.samples, 1))));
    runtimeState.complete = false;
    runtimeState.active = null;
    state.bins = Array.from({ length: runtimeState.sides }, () => 0);
    state.samples = [];
    state.theoretical = normalizeWeights(
      Array.from({ length: runtimeState.sides }, () => 1),
      state.params.samples,
    );
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
    state.bins[toss.resultIndex] += 1;
    state.samples.push(toss.resultIndex);
    runtimeState.settled += 1;
    boardGroup.remove(toss.mesh);
    toss.mesh.geometry.dispose();
    if (Array.isArray(toss.mesh.material)) {
      toss.mesh.material.forEach((material) => material.dispose());
    } else if (toss.mesh.material?.dispose) {
      toss.mesh.material.dispose();
    }
  }

  function step(dtMs) {
    if (!runtimeState.running || runtimeState.paused || runtimeState.complete) return;

    runtimeState.spawnTimer += dtMs;
    while (runtimeState.spawnTimer >= runtimeState.spawnInterval && runtimeState.spawned < runtimeState.total) {
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

    if (runtimeState.active == null && runtimeState.spawned < runtimeState.total && runtimeState.running) {
      spawnThrow();
    }

    if (runtimeState.spawned >= runtimeState.total && runtimeState.settled >= runtimeState.total && !runtimeState.complete) {
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
