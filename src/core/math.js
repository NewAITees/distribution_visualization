export const SCALE = 50;
export const toW = (px) => px / SCALE;
export const toS = (m) => m * SCALE;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function cloneParams(params) {
  return JSON.parse(JSON.stringify(params));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rng(seed = 1337) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function randomBetween(min, max, rand) {
  return min + (max - min) * rand();
}

export function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result *= (n - k + i) / i;
  }
  return result;
}

export function binomialSample(steps, p, rand) {
  let count = 0;
  for (let i = 0; i < steps; i += 1) {
    if (rand() < p) count += 1;
  }
  return count;
}

export function firstSuccessSample(p, rand) {
  if (p <= 0) return Number.POSITIVE_INFINITY;
  if (p >= 1) return 1;
  return Math.floor(Math.log1p(-rand()) / Math.log1p(-p)) + 1;
}

export function hypergeometricSample(population, successes, draws, rand) {
  let remainingSuccesses = successes;
  let remainingPopulation = population;
  let count = 0;
  for (let i = 0; i < draws; i += 1) {
    if (remainingPopulation <= 0) break;
    const draw = rand() < remainingSuccesses / remainingPopulation;
    if (draw) {
      count += 1;
      remainingSuccesses -= 1;
    }
    remainingPopulation -= 1;
  }
  return count;
}

export function poissonSample(lambda, rand) {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  while (product > threshold) {
    product *= rand();
    if (product > threshold) count += 1;
  }
  return count;
}

export function exponentialSample(scale, rand) {
  return -scale * Math.log(1 - rand());
}

export function gammaSample(shape, scale, rand) {
  let sum = 0;
  for (let i = 0; i < shape; i += 1) sum += exponentialSample(scale, rand);
  return sum;
}

export function lognormalSample(mu, sigma, rand) {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z0);
}

export function gaussianProfile(binCount, mean, sd) {
  const weights = [];
  for (let i = 0; i < binCount; i += 1) {
    const x = i;
    const exponent = -((x - mean) ** 2) / (2 * sd * sd);
    weights.push(Math.exp(exponent));
  }
  return weights;
}

export function binomialPmf(n, k, p) {
  return choose(n, k) * (p ** k) * ((1 - p) ** (n - k));
}

export function firstSuccessPmf(attempts, p) {
  if (attempts < 1 || p <= 0 || p > 1) return 0;
  return p * ((1 - p) ** (attempts - 1));
}

export function hypergeometricPmf(population, successes, draws, k) {
  if (k < 0 || k > successes || k > draws || draws - k > population - successes) return 0;
  return choose(successes, k) * choose(population - successes, draws - k) / choose(population, draws);
}

export function poissonPmf(lambda, k) {
  return (Math.exp(-lambda) * (lambda ** k)) / factorial(k);
}

export function exponentialPdf(x, scale) {
  if (x < 0) return 0;
  return (1 / scale) * Math.exp(-x / scale);
}

export function gammaPdf(x, shape, scale) {
  if (x < 0) return 0;
  const numerator = x ** (shape - 1) * Math.exp(-x / scale);
  const denominator = factorial(shape - 1) * scale ** shape;
  return numerator / denominator;
}

export function lognormalPdf(x, mu, sigma) {
  if (x <= 0) return 0;
  const denom = x * sigma * Math.sqrt(2 * Math.PI);
  const exponent = -((Math.log(x) - mu) ** 2) / (2 * sigma * sigma);
  return Math.exp(exponent) / denom;
}

export function normalizeWeights(weights, total) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (!sum) return weights.map(() => 0);
  return weights.map((value) => (value / sum) * total);
}

export function makeHexagonVertices(radius) {
  const verts = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    verts.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return verts;
}

export function makeRotatedBoxVertices(hw, hh, angle) {
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return corners.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
}
