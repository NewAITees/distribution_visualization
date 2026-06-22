function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function length3(x, y, z) {
  return Math.hypot(x, y, z);
}

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export function createBingoPhysics({
  cageRadius = 2.95,
  ballRadius = 0.22,
  restitution = 0.62,
  wallFriction = 0.985,
  releaseY = -2.18,
  releaseZ = 0.42,
  releaseX = 0.9,
}) {
  const balls = [];
  const scratch = { x: 0, y: 0, z: 0 };
  let gateCooldown = 0;

  function addBall(ball) {
    balls.push(ball);
  }

  function resolveSphereCollision(a, b) {
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dz = b.position.z - a.position.z;
    const dist = length3(dx, dy, dz);
    const minDist = (a.radius || ballRadius) + (b.radius || ballRadius);
    if (!dist || dist >= minDist) return;

    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    a.position.x -= nx * overlap * 0.5;
    a.position.y -= ny * overlap * 0.5;
    a.position.z -= nz * overlap * 0.5;
    b.position.x += nx * overlap * 0.5;
    b.position.y += ny * overlap * 0.5;
    b.position.z += nz * overlap * 0.5;

    const rvx = b.velocity.x - a.velocity.x;
    const rvy = b.velocity.y - a.velocity.y;
    const rvz = b.velocity.z - a.velocity.z;
    const sep = rvx * nx + rvy * ny + rvz * nz;
    if (sep > 0) return;

    const invMassA = 1 / Math.max(a.mass || 1, 1e-6);
    const invMassB = 1 / Math.max(b.mass || 1, 1e-6);
    const impulse = -(1 + restitution) * sep / (invMassA + invMassB);

    a.velocity.x -= impulse * invMassA * nx;
    a.velocity.y -= impulse * invMassA * ny;
    a.velocity.z -= impulse * invMassA * nz;
    b.velocity.x += impulse * invMassB * nx;
    b.velocity.y += impulse * invMassB * ny;
    b.velocity.z += impulse * invMassB * nz;
  }

  function handleShell(ball) {
    const x = ball.position.x;
    const y = ball.position.y;
    const z = ball.position.z;
    const radial = length3(x, y, z);
    const limit = cageRadius - (ball.radius || ballRadius);
    if (radial <= limit) return;

    const [nx, ny, nz] = normalize3(x, y, z);
    ball.position.x = nx * limit;
    ball.position.y = ny * limit;
    ball.position.z = nz * limit;

    const vn = ball.velocity.x * nx + ball.velocity.y * ny + ball.velocity.z * nz;
    if (vn > 0) return;

    ball.velocity.x -= (1 + restitution) * vn * nx;
    ball.velocity.y -= (1 + restitution) * vn * ny;
    ball.velocity.z -= (1 + restitution) * vn * nz;
    ball.velocity.x *= wallFriction;
    ball.velocity.y *= wallFriction;
    ball.velocity.z *= wallFriction;
  }

  function scoreReleaseCandidate(ball) {
    const dx = ball.position.x - releaseX;
    const dy = ball.position.y - releaseY;
    const dz = ball.position.z - releaseZ;
    return dx * dx * 1.4 + dy * dy * 2.4 + dz * dz * 1.1;
  }

  function step(dt, drumAngle, releaseLimit = 1) {
    gateCooldown = Math.max(0, gateCooldown - dt);

    const gY = -9.4 * Math.cos(drumAngle);
    const gZ = 9.4 * Math.sin(drumAngle);
    const releaseWindowOpen = gateCooldown <= 0 && Math.abs(Math.sin(drumAngle)) < 0.22;
    const released = [];
    let remainingReleases = Math.max(0, releaseLimit);

    balls.forEach((ball, index) => {
      if (ball.released) return;

      ball.velocity.y += gY * dt;
      ball.velocity.z += gZ * dt;

      const swirl = 0.65 + index * 0.002;
      scratch.x = 0;
      scratch.y = -ball.position.z * swirl;
      scratch.z = ball.position.y * swirl;
      ball.velocity.y += scratch.y * dt;
      ball.velocity.z += scratch.z * dt;

      ball.velocity.x *= 0.996;
      ball.velocity.y *= 0.996;
      ball.velocity.z *= 0.996;

      ball.position.x += ball.velocity.x * dt;
      ball.position.y += ball.velocity.y * dt;
      ball.position.z += ball.velocity.z * dt;

      handleShell(ball);

      if (ball.position.y < -1.4) {
        ball.velocity.z += -ball.position.z * 0.55 * dt;
        ball.velocity.y += (-ball.position.y - 1.4) * 0.45 * dt;
      }
    });

    for (let i = 0; i < balls.length; i += 1) {
      const a = balls[i];
      if (a.released) continue;
      for (let j = i + 1; j < balls.length; j += 1) {
        const b = balls[j];
        if (b.released) continue;
        resolveSphereCollision(a, b);
      }
    }

    if (releaseWindowOpen && remainingReleases > 0) {
      let bestBall = null;
      let bestScore = Infinity;
      for (let i = 0; i < balls.length; i += 1) {
        const ball = balls[i];
        if (ball.released) continue;
        if (ball.position.y > releaseY + 0.2) continue;
        if (Math.abs(ball.position.z - releaseZ) > 0.95) continue;
        if (Math.abs(ball.position.x - releaseX) > 1.15) continue;
        const score = scoreReleaseCandidate(ball);
        if (score < bestScore) {
          bestScore = score;
          bestBall = ball;
        }
      }

      if (bestBall) {
        bestBall.released = true;
        bestBall.velocity.x += Math.sign(bestBall.position.x - releaseX) * 0.35;
        bestBall.velocity.y += -1.7;
        bestBall.velocity.z += Math.sign(bestBall.position.z - releaseZ) * 0.28;
        released.push(bestBall);
        gateCooldown = 0.18;
        remainingReleases -= 1;
      }
    }

    return released;
  }

  function clear() {
    balls.length = 0;
    gateCooldown = 0;
  }

  return {
    balls,
    addBall,
    clear,
    step,
  };
}
