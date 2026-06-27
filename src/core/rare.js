import { firstSuccessSample, rng } from "./math.js";

function countAtOrBelow(sortedValues, target) {
  let left = 0;
  let right = sortedValues.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedValues[mid] <= target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
}

function empiricalThreshold(sortedAttempts, ratio) {
  if (!sortedAttempts.length) return null;
  const targetIndex = Math.max(0, Math.ceil(sortedAttempts.length * ratio) - 1);
  return sortedAttempts[Math.min(targetIndex, sortedAttempts.length - 1)];
}

function makeCurvePoints(sortedAttempts, machineCount, horizon, samplePoints = 120) {
  const points = [];
  if (machineCount <= 0) return points;
  const step = Math.max(1, Math.floor(horizon / Math.max(samplePoints - 1, 1)));
  for (let attempt = 1; attempt <= horizon; attempt += step) {
    const hitCount = countAtOrBelow(sortedAttempts, attempt);
    points.push({
      attempts: attempt,
      cumulative: (hitCount / machineCount) * 100,
    });
  }

  if (!points.length || points[points.length - 1].attempts !== horizon) {
    const hitCount = countAtOrBelow(sortedAttempts, horizon);
    points.push({
      attempts: horizon,
      cumulative: (hitCount / machineCount) * 100,
    });
  }

  return points;
}

export function simulateRarePachinkoDraw({ probabilityPercent, machineCount, seed = 1337 }) {
  const probability = Math.min(1, Math.max(0, probabilityPercent / 100));
  if (probability <= 0) {
    return {
      probability,
      probabilityPercent,
      machineCount,
      averageAttempts: 0,
      threshold50: null,
      threshold80: null,
      theoretical50: null,
      theoretical80: null,
      maxObserved: 0,
      curvePoints: [],
    };
  }
  if (probability >= 1) {
    return {
      probability,
      probabilityPercent,
      machineCount,
      averageAttempts: 1,
      threshold50: 1,
      threshold80: 1,
      theoretical50: 1,
      theoretical80: 1,
      maxObserved: 1,
      curvePoints: [
        { attempts: 1, cumulative: 100 },
      ],
    };
  }
  const random = rng(seed);
  const attempts = [];
  let totalAttempts = 0;

  for (let i = 0; i < machineCount; i += 1) {
    const hitAt = firstSuccessSample(probability, random);
    attempts.push(hitAt);
    totalAttempts += hitAt;
  }

  attempts.sort((a, b) => a - b);

  const averageAttempts = machineCount > 0 ? totalAttempts / machineCount : 0;
  const threshold50 = empiricalThreshold(attempts, 0.5);
  const threshold80 = empiricalThreshold(attempts, 0.8);
  const theoretical50 = probability > 0 && probability < 1 ? Math.ceil(Math.log(0.5) / Math.log1p(-probability)) : null;
  const theoretical80 = probability > 0 && probability < 1 ? Math.ceil(Math.log(0.2) / Math.log1p(-probability)) : null;
  const horizon = Math.max(
    20,
    threshold80 || 0,
    theoretical80 || 0,
    Math.ceil(averageAttempts * 2),
  );

  return {
    probability,
    probabilityPercent,
    machineCount,
    averageAttempts,
    threshold50,
    threshold80,
    theoretical50,
    theoretical80,
    maxObserved: attempts[attempts.length - 1] || 0,
    curvePoints: makeCurvePoints(attempts, machineCount, horizon),
  };
}

