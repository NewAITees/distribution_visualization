const W = 2.6;
const D = 0.75;
const Y_FLOOR = -3.8;
const Y_FUNNEL = -5.8;
const HOLE_HALF_X = 0.34;
const HOLE_HALF_Z = HOLE_HALF_X * 0.8;

function quatFromAxisAngle(x, y, z, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(half) };
}

function rotatePoint(q, p) {
  const { x, y, z, w } = q;
  const ix = w * p.x + y * p.z - z * p.y;
  const iy = w * p.y + z * p.x - x * p.z;
  const iz = w * p.z + x * p.y - y * p.x;
  const iw = -x * p.x - y * p.y - z * p.z;

  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

function transformPoint(q, t, p) {
  const r = rotatePoint(q, p);
  return { x: r.x + t.x, y: r.y + t.y, z: r.z + t.z };
}

function assertRamp(name, pointA, pointB, axis, outerIsLarger) {
  const outer = outerIsLarger
    ? (pointA[axis] >= pointB[axis] ? pointA : pointB)
    : (pointA[axis] <= pointB[axis] ? pointA : pointB);
  const inner = outer === pointA ? pointB : pointA;

  if (!(outer.y > inner.y)) {
    throw new Error(`${name} ramp is inverted: outer=${JSON.stringify(outer)} inner=${JSON.stringify(inner)}`);
  }

  return { outer, inner };
}

function verify() {
  const funnelH = Y_FLOOR - Y_FUNNEL;

  const leftRightDX = W - HOLE_HALF_X;
  const leftRightLen = Math.sqrt(funnelH * funnelH + leftRightDX * leftRightDX);
  const leftRightAngle = Math.atan2(funnelH, leftRightDX);
  const leftRightCY = (Y_FLOOR + Y_FUNNEL) / 2;
  const leftRightCX = (W + HOLE_HALF_X) / 2;

  const frontBackDZ = D - HOLE_HALF_Z;
  const frontBackLen = Math.sqrt(funnelH * funnelH + frontBackDZ * frontBackDZ);
  const frontBackAngle = Math.atan2(funnelH, frontBackDZ);
  const frontBackCZ = (D + HOLE_HALF_Z) / 2;

  const checks = [];

  // Left ramp: outer edge at x = -W, inner edge at x = -HOLE_HALF_X.
  {
    const q = quatFromAxisAngle(0, 0, 1, -leftRightAngle / 2);
    const t = { x: -leftRightCX, y: leftRightCY, z: 0 };
    const pointA = transformPoint(q, t, { x: -leftRightLen / 2, y: 0.09, z: 0 });
    const pointB = transformPoint(q, t, { x: leftRightLen / 2, y: 0.09, z: 0 });
    checks.push({ name: 'left', ...assertRamp('left', pointA, pointB, 'x', false) });
  }

  // Right ramp: outer edge at x = +W, inner edge at x = +HOLE_HALF_X.
  {
    const q = quatFromAxisAngle(0, 0, 1, leftRightAngle / 2);
    const t = { x: leftRightCX, y: leftRightCY, z: 0 };
    const pointA = transformPoint(q, t, { x: -leftRightLen / 2, y: 0.09, z: 0 });
    const pointB = transformPoint(q, t, { x: leftRightLen / 2, y: 0.09, z: 0 });
    checks.push({ name: 'right', ...assertRamp('right', pointA, pointB, 'x', true) });
  }

  // Front ramp: outer edge at z = +D, inner edge at z = +HOLE_HALF_Z.
  {
    const q = quatFromAxisAngle(1, 0, 0, -frontBackAngle);
    const t = { x: 0, y: leftRightCY, z: frontBackCZ };
    const pointA = transformPoint(q, t, { x: 0, y: 0.09, z: -frontBackLen / 2 });
    const pointB = transformPoint(q, t, { x: 0, y: 0.09, z: frontBackLen / 2 });
    checks.push({ name: 'front', ...assertRamp('front', pointA, pointB, 'z', true) });
  }

  // Back ramp: outer edge at z = -D, inner edge at z = -HOLE_HALF_Z.
  {
    const q = quatFromAxisAngle(1, 0, 0, frontBackAngle);
    const t = { x: 0, y: leftRightCY, z: -frontBackCZ };
    const pointA = transformPoint(q, t, { x: 0, y: 0.09, z: -frontBackLen / 2 });
    const pointB = transformPoint(q, t, { x: 0, y: 0.09, z: frontBackLen / 2 });
    checks.push({ name: 'back', ...assertRamp('back', pointA, pointB, 'z', false) });
  }

  console.log('Funnel slope verification');
  for (const check of checks) {
    console.log(`- ${check.name}: outer=${JSON.stringify(check.outer)} inner=${JSON.stringify(check.inner)}`);
  }
  console.log('PASS');
}

try {
  verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  globalThis.process.exit(1);
}

