const rapierModule = await import("../../../node_modules/@dimforge/rapier3d-compat/rapier.mjs");
const RAPIER = rapierModule.default ?? rapierModule;

await RAPIER.init({});

function vec3(x, y, z) {
  return { x, y, z };
}

function quatFromAxisAngle(x, y, z, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(half) };
}

function createCollider(world, body, desc) {
  return world.createCollider(desc, body);
}

export function createBingoPhysics({
  ballRadius = 0.22,
  chamberHalfWidth = 2.75,
  chamberHalfHeight = 2.0,
  chamberHalfDepth = 1.75,
} = {}) {
  const world = new RAPIER.World(vec3(0, -9.81, 0));
  world.integrationParameters.dt = 1 / 60;
  world.integrationParameters.numSolverIterations = 8;
  world.integrationParameters.numAdditionalFrictionIterations = 4;

  const eventQueue = new RAPIER.EventQueue(true);
  const balls = new Set();
  const colliderToBall = new Map();

  const machine = {
    elapsed: 0,
    gateBody: null,
    sensorHandle: null,
    paddles: [],
  };

  function addFixedBox(pos, size, options = {}) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]),
    );
    const collider = createCollider(
      world,
      body,
      RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setFriction(options.friction ?? 0.8)
        .setRestitution(options.restitution ?? 0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    );
    return { body, collider };
  }

  function addKinematicBox(pos, size, options = {}) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos[0], pos[1], pos[2]),
    );
    const collider = createCollider(
      world,
      body,
      RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
        .setFriction(options.friction ?? 0.9)
        .setRestitution(options.restitution ?? 0.04)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    );
    return { body, collider };
  }

  function buildMachine() {
    addFixedBox([-chamberHalfWidth, chamberHalfHeight, 0], [0.18, chamberHalfHeight * 2, chamberHalfDepth * 2], {
      friction: 0.75,
    });
    addFixedBox([chamberHalfWidth, chamberHalfHeight, 0], [0.18, chamberHalfHeight * 2, chamberHalfDepth * 2], {
      friction: 0.75,
    });
    addFixedBox([0, chamberHalfHeight, -chamberHalfDepth], [chamberHalfWidth * 2, chamberHalfHeight * 2, 0.18], {
      friction: 0.75,
    });
    addFixedBox([0, chamberHalfHeight, chamberHalfDepth], [chamberHalfWidth * 2, chamberHalfHeight * 2, 0.18], {
      friction: 0.75,
    });
    addFixedBox([0, chamberHalfHeight * 2.05, 0], [chamberHalfWidth * 2, 0.18, chamberHalfDepth * 2], {
      friction: 0.75,
    });

    // Floor leaves a centered hole for the outlet gate.
    addFixedBox([-1.55, -0.05, 0], [2.9, 0.16, chamberHalfDepth * 2], { friction: 0.85 });
    addFixedBox([1.55, -0.05, 0], [2.9, 0.16, chamberHalfDepth * 2], { friction: 0.85 });
    addFixedBox([0, -0.05, -1.15], [0.7, 0.16, 1.2], { friction: 0.85 });
    addFixedBox([0, -0.05, 1.15], [0.7, 0.16, 1.2], { friction: 0.85 });

    const gate = addKinematicBox([0, 0.08, 0], [0.82, 0.26, 0.82], { friction: 1.0 });
    machine.gateBody = gate.body;

    const sensorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.45, 0));
    const sensor = createCollider(
      world,
      sensorBody,
      RAPIER.ColliderDesc.cuboid(0.55, 0.25, 0.55)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    );
    machine.sensorHandle = sensor.handle;

    machine.paddles.push({
      body: addKinematicBox([0, 1.55, 0], [4.35, 0.14, 0.28], { friction: 0.7 }).body,
      mode: "rollZ",
      phase: 0,
    });
    machine.paddles.push({
      body: addKinematicBox([0, 2.45, 0], [0.28, 0.14, 2.55], { friction: 0.7 }).body,
      mode: "rollY",
      phase: Math.PI / 2,
    });
    machine.paddles.push({
      body: addKinematicBox([0, 0.42, 0], [4.75, 0.18, 0.2], { friction: 0.7 }).body,
      mode: "sweepY",
      phase: Math.PI / 5,
    });
  }

  buildMachine();

  function addBall(ball, initialPosition = null) {
    const position = initialPosition ?? ball.mesh.position;
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.22)
        .setAngularDamping(0.12),
    );
    rb.enableCcd(true);

    const collider = createCollider(
      world,
      rb,
      RAPIER.ColliderDesc.ball(ball.radius ?? ballRadius)
        .setDensity(1.2)
        .setFriction(0.65)
        .setRestitution(0.16)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    );

    ball.rb = rb;
    ball.collider = collider;
    ball.released = false;
    ball.removed = false;
    balls.add(ball);
    colliderToBall.set(collider.handle, ball);
    return ball;
  }

  function setBallState(ball, position, linearVelocity, angularVelocity) {
    if (!ball.rb || ball.removed) return;
    ball.rb.setTranslation(vec3(position.x, position.y, position.z), true);
    ball.rb.setLinvel(vec3(linearVelocity.x, linearVelocity.y, linearVelocity.z), true);
    ball.rb.setAngvel(vec3(angularVelocity.x, angularVelocity.y, angularVelocity.z), true);
    ball.released = false;
  }

  function recycleBall(ball, center = null) {
    const base = center ?? {
      x: (Math.random() - 0.5) * 1.4,
      y: 1.6 + Math.random() * 0.8,
      z: (Math.random() - 0.5) * 1.0,
    };
    setBallState(
      ball,
      base,
      {
        x: (Math.random() - 0.5) * 0.5,
        y: -(0.2 + Math.random() * 0.45),
        z: (Math.random() - 0.5) * 0.5,
      },
      {
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.5) * 2.2,
        z: (Math.random() - 0.5) * 2.2,
      },
    );
  }

  function removeBall(ball) {
    if (!ball.rb || ball.removed) return;
    colliderToBall.delete(ball.collider?.handle);
    world.removeRigidBody(ball.rb);
    ball.rb = null;
    ball.collider = null;
    ball.removed = true;
    balls.delete(ball);
  }

  function clear() {
    for (const ball of balls) {
      removeBall(ball);
    }
    balls.clear();
    colliderToBall.clear();
    machine.elapsed = 0;
  }

  function updatePaddles(drumAngle, spinSpeed) {
    const speed = 1.45 + Math.max(0, spinSpeed) * 0.1;
    for (const paddle of machine.paddles) {
      const angle = drumAngle * speed + paddle.phase;
      let rotation;
      if (paddle.mode === "rollZ") {
        rotation = quatFromAxisAngle(0, 0, 1, angle);
      } else if (paddle.mode === "rollY") {
        rotation = quatFromAxisAngle(0, 1, 0, -angle * 1.35);
      } else {
        rotation = quatFromAxisAngle(0, 1, 0, angle * 1.8);
      }
      paddle.body.setNextKinematicRotation(rotation);
    }
  }

  function updateGate(remainingDraws) {
    const cycle = 1.25;
    const openWindow = 0.42;
    const open = remainingDraws > 0 && machine.elapsed % cycle < openWindow;
    machine.gateBody.setNextKinematicTranslation(open ? vec3(0, -1.4, 0) : vec3(0, 0.08, 0));
  }

  function step(dtMs, drumAngle, spinSpeed, remainingDraws = 1) {
    const dt = Math.max(1 / 240, Math.min(dtMs / 1000, 1 / 24));
    machine.elapsed += dt;
    world.integrationParameters.dt = dt;

    updatePaddles(drumAngle, spinSpeed);
    updateGate(remainingDraws);
    world.step(eventQueue);

    const released = [];
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      let ball = null;
      if (h1 === machine.sensorHandle) {
        ball = colliderToBall.get(h2) ?? null;
      } else if (h2 === machine.sensorHandle) {
        ball = colliderToBall.get(h1) ?? null;
      }
      if (!ball || ball.released || ball.removed) return;
      ball.released = true;
      released.push(ball);
    });

    return released;
  }

  return {
    addBall,
    recycleBall,
    removeBall,
    clear,
    step,
    get world() {
      return world;
    },
    get balls() {
      return balls;
    },
  };
}
