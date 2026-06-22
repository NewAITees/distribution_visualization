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
  tangentialFriction = 0.28,
  releaseY = -2.18,
  releaseZ = 0.42,
  releaseX = 0.9,
}) {
  const balls = [];
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

  function handleShell(ball, drumAngVel) {
    const px = ball.position.x;
    const py = ball.position.y;
    const pz = ball.position.z;
    const radial = length3(px, py, pz);
    const limit = cageRadius - (ball.radius || ballRadius);
    if (radial <= limit) return;

    const [nx, ny, nz] = normalize3(px, py, pz);
    ball.position.x = nx * limit;
    ball.position.y = ny * limit;
    ball.position.z = nz * limit;

    const vn = ball.velocity.x * nx + ball.velocity.y * ny + ball.velocity.z * nz;
    if (vn > 0) return;

    // Normal restitution impulse
    ball.velocity.x -= (1 + restitution) * vn * nx;
    ball.velocity.y -= (1 + restitution) * vn * ny;
    ball.velocity.z -= (1 + restitution) * vn * nz;

    // Wall tangential velocity: ω × contact_point
    // ω = (drumAngVel, 0, 0)  →  (ω,0,0)×(px,py,pz) = (0, -ω*pz, ω*py)
    const wallVy = -drumAngVel * pz;
    const wallVz = drumAngVel * py;

    // Relative velocity of ball with respect to wall
    const relvx = ball.velocity.x;
    const relvy = ball.velocity.y - wallVy;
    const relvz = ball.velocity.z - wallVz;

    // Strip normal component → tangential only
    const relvn = relvx * nx + relvy * ny + relvz * nz;
    const reltx = relvx - relvn * nx;
    const relty = relvy - relvn * ny;
    const reltz = relvz - relvn * nz;

    // Transfer tangential velocity from wall to ball (friction impulse)
    ball.velocity.x -= reltx * tangentialFriction;
    ball.velocity.y -= relty * tangentialFriction;
    ball.velocity.z -= reltz * tangentialFriction;
  }

  function scoreReleaseCandidate(ball) {
    // World-space: pick the lowest ball (most negative Y)
    return ball.position.y;
  }

  function step(dt, drumAngle, drumAngVel, releaseLimit = 1) {
    gateCooldown = Math.max(0, gateCooldown - dt);

    // World-space gravity (balls live in world space, not drum-local)
    const gY = -9.4;
    const gZ = 0;
    // Gate opens when drum outlet faces downward (cos > 0 ensures angle near 0, not π)
    const releaseWindowOpen = gateCooldown <= 0 && Math.abs(Math.sin(drumAngle)) < 0.22 && Math.cos(drumAngle) > 0;
    const released = [];
    let remainingReleases = Math.max(0, releaseLimit);

    balls.forEach((ball) => {
      if (ball.released) return;

      ball.velocity.y += gY * dt;
      ball.velocity.z += gZ * dt;

      // Gentle damping to prevent runaway energy accumulation
      ball.velocity.x *= 0.999;
      ball.velocity.y *= 0.999;
      ball.velocity.z *= 0.999;

      ball.position.x += ball.velocity.x * dt;
      ball.position.y += ball.velocity.y * dt;
      ball.position.z += ball.velocity.z * dt;

      // Wall friction transfers drum rotation to ball tangentially
      handleShell(ball, drumAngVel);

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
        // World-space: just check ball is near the bottom of the cage
        if (ball.position.y > releaseY + 0.2) continue;
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
