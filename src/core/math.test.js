import { describe, it, expect } from "vitest";
import {
  clamp,
  choose,
  binomialPmf,
  hypergeometricPmf,
  normalizeWeights,
  rng,
  binomialSample,
  hypergeometricSample,
} from "./math.js";

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps to min", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  it("clamps to max", () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("choose", () => {
  it("C(5,2) = 10", () => {
    expect(choose(5, 2)).toBe(10);
  });
  it("C(n,0) = 1", () => {
    expect(choose(10, 0)).toBe(1);
  });
  it("C(n,n) = 1", () => {
    expect(choose(7, 7)).toBe(1);
  });
  it("returns 0 for k > n", () => {
    expect(choose(3, 5)).toBe(0);
  });
});

describe("binomialPmf", () => {
  it("fair coin P(k=5, n=10, p=0.5) ≈ 0.2461", () => {
    expect(binomialPmf(10, 5, 0.5)).toBeCloseTo(0.24609375, 6);
  });
  it("P(k=0, n=5, p=0) = 1", () => {
    expect(binomialPmf(5, 0, 0)).toBeCloseTo(1, 6);
  });
  it("sums to 1 over all k", () => {
    const n = 8;
    const p = 0.3;
    const total = Array.from({ length: n + 1 }, (_, k) => binomialPmf(n, k, p)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe("hypergeometricPmf", () => {
  it("population=10, successes=4, draws=3: sums to 1", () => {
    const total = Array.from({ length: 4 }, (_, k) => hypergeometricPmf(10, 4, 3, k)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });
  it("returns 0 for impossible k", () => {
    expect(hypergeometricPmf(10, 2, 3, 3)).toBe(0);
  });
});

describe("normalizeWeights", () => {
  it("scales weights to sum to target", () => {
    const weights = [1, 2, 3];
    const normalized = normalizeWeights(weights, 60);
    expect(normalized.reduce((a, b) => a + b, 0)).toBeCloseTo(60, 5);
  });
  it("preserves proportions", () => {
    const weights = [1, 3];
    const normalized = normalizeWeights(weights, 100);
    expect(normalized[1] / normalized[0]).toBeCloseTo(3, 5);
  });
});

describe("rng determinism", () => {
  it("same seed produces same sequence", () => {
    const r1 = rng(42);
    const r2 = rng(42);
    for (let i = 0; i < 10; i += 1) {
      expect(r1()).toBe(r2());
    }
  });
});

describe("binomialSample", () => {
  it("p=0 always returns 0", () => {
    const rand = rng(1);
    for (let i = 0; i < 20; i += 1) {
      expect(binomialSample(10, 0, rand)).toBe(0);
    }
  });
  it("p=1 always returns n", () => {
    const rand = rng(1);
    for (let i = 0; i < 20; i += 1) {
      expect(binomialSample(10, 1, rand)).toBe(10);
    }
  });
});

describe("hypergeometricSample", () => {
  it("never exceeds successes or draws", () => {
    const rand = rng(99);
    for (let i = 0; i < 50; i += 1) {
      const result = hypergeometricSample(20, 5, 6, rand);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(5);
    }
  });
});
