import { createGaltonBoard } from "./src/scenes/galton/index.js";
import { createCoinDiceScene } from "./src/scenes/coin-dice/index.js";
import { createPachinkoDrawScene } from "./src/scenes/pachinko-draw/index.js";
import { simulateRarePachinkoDraw } from "./src/core/rare.js";
import {
  toW,
  toS,
  clamp,
  cloneParams,
  rng,
  binomialSample,
  hypergeometricSample,
  poissonSample,
  exponentialSample,
  gammaSample,
  lognormalSample,
  gaussianProfile,
  binomialPmf,
  hypergeometricPmf,
  poissonPmf,
  exponentialPdf,
  gammaPdf,
  lognormalPdf,
  normalizeWeights,
  makeHexagonVertices,
  makeRotatedBoxVertices,
} from "./src/core/math.js";
import { drawBackground, roundRect, drawStaticChart, drawHistogramStrip, drawRareProgression } from "./src/core/canvas.js";

const GALTON_BIAS_P = 0.68;

let lastFrameTime = 0;
let loopRunning = false;

function geometricPmf(k, p) {
  return ((1 - p) ** k) * p;
}

function negativeBinomialPmf(k, r, p) {
  if (k < 0) return 0;
  let coeff = 1;
  for (let i = 1; i <= k; i += 1) {
    coeff *= (r + i - 1) / i;
  }
  return coeff * (p ** r) * ((1 - p) ** k);
}

const distributionSpecs = {
  normal: {
    id: "normal",
    title: "正規分布",
    tag: "galton board",
    shape: "釣鐘型",
    description:
      "Galton board の中心。左右分岐を繰り返した結果が、3D の積層としてまとまる。実際の衝突で釘を通過した結果を集計する。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "物理演算: ◎"],
    defaults: { samples: 500, steps: 14 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "steps", label: "段数", min: 8, max: 20, step: 1, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.steps + 1;
    },
    physics: true,
    physicsMode: "galton",
    sample(params, rand) {
      return binomialSample(params.steps, 0.5, rand);
    },
    theoretical(params, bins) {
      const mean = params.steps * 0.5;
      const variance = params.steps * 0.5 * (1 - 0.5);
      const sd = Math.sqrt(Math.max(variance, 1e-6));
      return gaussianProfile(bins, mean, sd);
    },
  },
  binom: {
    id: "binom",
    title: "偏り分岐",
    tag: "biased galton",
    shape: "非対称",
    description:
      "three.js の 3D 空間で偏ったコインを何度も投げ、成功回数を 0〜段数のビンに集計する。コインの反復投げから二項分布を作る。",
    evaluation: ["適切性: ◎", "見栄え: ○", "わかりやすさ: ◎", "物理演算: ◎"],
    defaults: { samples: 500, steps: 14 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "steps", label: "段数", min: 8, max: 20, step: 1, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.steps + 1;
    },
    physics: false,
    render3d: true,
    threeKind: "binom",
    biasP: GALTON_BIAS_P,
    sample(params, rand) {
      return binomialSample(params.steps, GALTON_BIAS_P, rand);
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins; k += 1) {
        weights.push(binomialPmf(params.steps, k, GALTON_BIAS_P));
      }
      return weights;
    },
  },
  bernoulli: {
    id: "bernoulli",
    title: "ベルヌーイ分布",
    tag: "3D coin toss",
    shape: "1回の表裏",
    description:
      "1回だけコインを投げ、表か裏かを 0/1 の 2 ビンに集計する。最小単位のコイン分布。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "3D 表現: ◎"],
    defaults: { samples: 80, p: 0.5 },
    controls: [
      { key: "samples", label: "投数", min: 10, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "p", label: "表の確率 p", min: 0.05, max: 0.95, step: 0.05, format: (v) => v.toFixed(2) },
    ],
    binsFor() {
      return 2;
    },
    physics: false,
    render3d: true,
    threeKind: "bernoulli",
    sample(params, rand) {
      return rand() < params.p ? 1 : 0;
    },
    theoretical(params, bins) {
      return [1 - params.p, params.p].slice(0, bins);
    },
  },
  binom3d: {
    id: "binom3d",
    title: "二項分布",
    tag: "3D coin toss",
    shape: "n回中の成功回数",
    description:
      "同じコインを n 回投げ、表の回数を 0 から n のビンに集計する。固定回数の反復投げで二項分布を作る。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "3D 表現: ◎"],
    defaults: { samples: 500, trials: 14, p: 0.5 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "trials", label: "試行回数 n", min: 2, max: 20, step: 1, format: (v) => `${v}` },
      { key: "p", label: "表の確率 p", min: 0.05, max: 0.95, step: 0.05, format: (v) => v.toFixed(2) },
    ],
    binsFor(params) {
      return params.trials + 1;
    },
    physics: false,
    render3d: true,
    threeKind: "binom",
    sample(params, rand) {
      return binomialSample(params.trials, params.p, rand);
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins; k += 1) {
        weights.push(binomialPmf(params.trials, k, params.p));
      }
      return weights;
    },
  },
  geometric: {
    id: "geometric",
    title: "幾何分布",
    tag: "3D coin toss",
    shape: "最初の成功まで",
    description:
      "表が最初に出るまでコインを投げ続け、その失敗回数を集計する。試行の長さ自体が分布になる。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "3D 表現: ◎"],
    defaults: { samples: 400, maxTries: 12, p: 0.5 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "maxTries", label: "最大試行回数", min: 3, max: 20, step: 1, format: (v) => `${v}` },
      { key: "p", label: "表の確率 p", min: 0.05, max: 0.95, step: 0.05, format: (v) => v.toFixed(2) },
    ],
    binsFor(params) {
      return params.maxTries + 1;
    },
    physics: false,
    render3d: true,
    threeKind: "geometric",
    sample(params, rand) {
      let failures = 0;
      while (failures < params.maxTries) {
        if (rand() < params.p) return failures;
        failures += 1;
      }
      return params.maxTries;
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins - 1; k += 1) {
        weights.push(geometricPmf(k, params.p));
      }
      weights.push((1 - params.p) ** params.maxTries);
      return weights;
    },
  },
  negbinom: {
    id: "negbinom",
    title: "負の二項分布",
    tag: "3D coin toss",
    shape: "r回成功まで",
    description:
      "r 回表が出るまでコインを投げ、その途中で出た裏の回数を集計する。成功回数を固定した待ち時間の分布。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "3D 表現: ◎"],
    defaults: { samples: 400, successesNeeded: 4, maxFailures: 24, p: 0.5 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "successesNeeded", label: "必要な成功数 r", min: 1, max: 8, step: 1, format: (v) => `${v}` },
      { key: "maxFailures", label: "最大失敗回数", min: 6, max: 40, step: 1, format: (v) => `${v}` },
      { key: "p", label: "表の確率 p", min: 0.05, max: 0.95, step: 0.05, format: (v) => v.toFixed(2) },
    ],
    binsFor(params) {
      return params.maxFailures + 1;
    },
    physics: false,
    render3d: true,
    threeKind: "negbinom",
    sample(params, rand) {
      let successes = 0;
      let failures = 0;
      while (failures < params.maxFailures) {
        if (rand() < params.p) {
          successes += 1;
          if (successes >= params.successesNeeded) return failures;
        } else {
          failures += 1;
        }
      }
      return params.maxFailures;
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins - 1; k += 1) {
        weights.push(negativeBinomialPmf(k, params.successesNeeded, params.p));
      }
      const tail = Math.max(0, 1 - weights.reduce((sum, value) => sum + value, 0));
      weights.push(tail);
      return weights;
    },
  },
  dice3d: {
    id: "dice3d",
    title: "離散一様分布",
    tag: "3D dice roll",
    shape: "1〜6 / 1〜10",
    description:
      "three.js の 3D 空間でサイコロを投げ、出目を 1〜6 または 1〜10 のビンに集計する。サイコロ投げから分布を作る流れを見せる。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "3D 表現: ◎"],
    defaults: { samples: 60, sides: 6 },
    controls: [
      { key: "samples", label: "投数", min: 10, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "sides", label: "面数", min: 6, max: 10, step: 4, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.sides || 6;
    },
    physics: false,
    render3d: true,
    threeKind: "dice",
    sample(params, rand) {
      return Math.floor(rand() * params.sides);
    },
    theoretical(params, bins) {
      const value = 1 / Math.max(bins, 1);
      return Array.from({ length: bins }, () => value);
    },
  },
  hypergeom: {
    id: "hypergeom",
    title: "超幾何分布",
    tag: "落下抽選器",
    shape: "減少する母集団",
    description:
      "3D のビンゴマシンで玉を戻さずに抽出し、成功数を集計する。箱の中身が減っていく様子で戻さない抽選を見せる。",
    evaluation: ["適切性: ◎", "見栄え: ○", "わかりやすさ: ○", "物理演算: ○"],
    defaults: { samples: 80, population: 40, successes: 14, draws: 6 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "population", label: "母集団サイズ", min: 12, max: 80, step: 1, format: (v) => `${v}` },
      { key: "successes", label: "成功個数", min: 1, max: 40, step: 1, format: (v) => `${v}` },
      { key: "draws", label: "取り出し数", min: 1, max: 12, step: 1, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.draws + 1;
    },
    physics: false,
    render3d: true,
    threeKind: "pachinko-draw",
    sample(params, rand) {
      return hypergeometricSample(params.population, params.successes, params.draws, rand);
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins; k += 1) {
        weights.push(hypergeometricPmf(params.population, params.successes, params.draws, k));
      }
      return weights;
    },
  },
  binom_pachinko_draw: {
    id: "binom_pachinko_draw",
    title: "二項分布（抽選）",
    tag: "落下抽選器",
    shape: "戻す抽選",
    description:
      "3D のビンゴマシンで玉を戻しながら抽出し、成功数を集計する。毎回同じ確率で引くため二項分布になる。超幾何分布と対比して「戻す」と「戻さない」の違いを見せる。",
    evaluation: ["適切性: ◎", "見栄え: ○", "わかりやすさ: ○", "物理演算: ○"],
    defaults: { samples: 80, population: 40, successes: 14, draws: 6 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "population", label: "母集団サイズ", min: 12, max: 80, step: 1, format: (v) => `${v}` },
      { key: "successes", label: "成功個数", min: 1, max: 40, step: 1, format: (v) => `${v}` },
      { key: "draws", label: "取り出し数", min: 1, max: 12, step: 1, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.draws + 1;
    },
    physics: false,
    render3d: true,
    threeKind: "pachinko-draw-replace",
    sample(params, rand) {
      const p = params.successes / Math.max(1, params.population);
      return binomialSample(params.draws, p, rand);
    },
    theoretical(params, bins) {
      const p = params.successes / Math.max(1, params.population);
      const weights = [];
      for (let k = 0; k < bins; k += 1) {
        weights.push(binomialPmf(params.draws, k, p));
      }
      return weights;
    },
  },
  rarehunt: {
    id: "rarehunt",
    title: "レア到達シミュレーション",
    tag: "落下抽選器",
    shape: "初当たりまで",
    description:
      "戻すタイプのビンゴマシンを大量に独立試行し、初当たりまでの平均回数と 50% / 80% 到達回数を出す。入力した当たり確率から、累積到達率がどう増えていくかを確認する。",
    evaluation: ["適切性: ◎", "見栄え: △", "わかりやすさ: ◎", "物理演算: △"],
    defaults: { samples: 5000, probabilityPercent: 0.01 },
    controls: [
      { key: "samples", label: "ビンゴマシン数", min: 1000, max: 20000, step: 500, format: (v) => `${v}` },
      {
        key: "probabilityPercent",
        label: "当たり確率 (%)",
        min: 0.001,
        max: 100,
        step: 0.001,
        inputType: "number",
        format: (v) => `${Number(v).toFixed(3)}%`,
      },
    ],
    binsFor() {
      return 0;
    },
    rareAnalysis: true,
  },
  poisson: {
    id: "poisson",
    title: "ポアソン分布",
    tag: "impact map",
    shape: "着弾点マップ",
    description:
      "3D 空間での着弾点や検出イベントとして見せる。ランダム発生点をカウントする構造に寄せる。",
    evaluation: ["適切性: ○", "見栄え: △", "わかりやすさ: △", "物理演算: ◎"],
    defaults: { samples: 80, lambda: 4.2 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "lambda", label: "平均発生率 λ", min: 0.5, max: 12, step: 0.1, format: (v) => v.toFixed(1) },
    ],
    binsFor(params) {
      return Math.max(12, Math.ceil(params.lambda + Math.sqrt(params.lambda) * 6) + 1);
    },
    physics: false,
    sample(params, rand) {
      return poissonSample(params.lambda, rand);
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins; k += 1) {
        weights.push(poissonPmf(params.lambda, k));
      }
      return weights;
    },
  },
  expon: {
    id: "expon",
    title: "指数分布",
    tag: "waiting time",
    shape: "待ち時間",
    description:
      "次のイベントまでの待ち時間を視覚化する。無記憶性を見せるには、反復サンプルの比較が要る。",
    evaluation: ["適切性: ○", "見栄え: △", "わかりやすさ: △", "物理演算: ○"],
    defaults: { samples: 80, scale: 1.0 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "scale", label: "スケール", min: 0.3, max: 2.2, step: 0.1, format: (v) => v.toFixed(1) },
    ],
    binsFor() {
      return 18;
    },
    physics: false,
    sample(params, rand) {
      return exponentialSample(params.scale, rand);
    },
    theoretical(params, bins) {
      const maxValue = params.scale * 6;
      const weights = [];
      for (let i = 0; i < bins; i += 1) {
        const value = ((i + 0.5) / bins) * maxValue;
        weights.push(exponentialPdf(value, params.scale));
      }
      return weights;
    },
  },
  gamma: {
    id: "gamma",
    title: "ガンマ分布",
    tag: "sum of waits",
    shape: "待ち時間の合成",
    description:
      "指数分布を複数回足し合わせた見せ方。単発よりも厚みが出るが、演出は指数分布との連動が必要。",
    evaluation: ["適切性: ○", "見栄え: △", "わかりやすさ: △", "物理演算: ○"],
    defaults: { samples: 80, shape: 3, scale: 1.0 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "shape", label: "形状 k", min: 1, max: 8, step: 1, format: (v) => `${v}` },
      { key: "scale", label: "スケール", min: 0.3, max: 2.2, step: 0.1, format: (v) => v.toFixed(1) },
    ],
    binsFor() {
      return 18;
    },
    physics: false,
    sample(params, rand) {
      return gammaSample(params.shape, params.scale, rand);
    },
    theoretical(params, bins) {
      const maxValue = params.shape * params.scale * 4;
      const weights = [];
      for (let i = 0; i < bins; i += 1) {
        const value = ((i + 0.5) / bins) * maxValue;
        weights.push(gammaPdf(value, params.shape, params.scale));
      }
      return weights;
    },
  },
  lognorm: {
    id: "lognorm",
    title: "対数正規分布",
    tag: "multiplicative",
    shape: "右裾が長い",
    description:
      "掛け算的な変動で右に歪む。正規分布と対比すると違いがはっきり出る。",
    evaluation: ["適切性: ○", "見栄え: ○", "わかりやすさ: △", "物理演算: ○"],
    defaults: { samples: 80, mu: 0.35, sigma: 0.65 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 1000, step: 5, format: (v) => `${v}` },
      { key: "mu", label: "平均 μ", min: -0.3, max: 1.0, step: 0.05, format: (v) => v.toFixed(2) },
      { key: "sigma", label: "標準偏差 σ", min: 0.2, max: 1.2, step: 0.05, format: (v) => v.toFixed(2) },
    ],
    binsFor() {
      return 18;
    },
    physics: false,
    sample(params, rand) {
      return lognormalSample(params.mu, params.sigma, rand);
    },
    theoretical(params, bins) {
      const maxValue = Math.exp(params.mu + params.sigma * 2.5);
      const weights = [];
      for (let i = 0; i < bins; i += 1) {
        const value = ((i + 0.5) / bins) * maxValue;
        weights.push(lognormalPdf(value, params.mu, params.sigma));
      }
      return weights;
    },
  },
};

const distributions = Object.values(distributionSpecs);

const state = {
  active: distributions[0],
  params: cloneParams(distributions[0].defaults),
  samples: [],
  bins: [],
  theoretical: [],
  rareReport: null,
  paused: false,
  rngSeed: 1337,
  physics: null,
  threeScene: null,
  physicsComplete: false,
};

const els = {
  list: document.getElementById("distribution-list"),
  title: document.getElementById("stage-title"),
  tag: document.getElementById("stage-tag"),
  description: document.getElementById("distribution-description"),
  sampleCount: document.getElementById("sample-count"),
  binCount: document.getElementById("bin-count"),
  peakBin: document.getElementById("peak-bin"),
  shapeName: document.getElementById("shape-name"),
  evaluationList: document.getElementById("evaluation-list"),
  parameterControls: document.getElementById("parameter-controls"),
  reroll: document.getElementById("reroll-button"),
  pause: document.getElementById("pause-button"),
  canvas: document.getElementById("scene"),
  canvas3d: document.getElementById("scene-3d"),
  rareSummary: document.getElementById("rare-summary"),
  rareAverage: document.getElementById("rare-average"),
  rareThreshold50: document.getElementById("rare-threshold-50"),
  rareThreshold80: document.getElementById("rare-threshold-80"),
  rareMachines: document.getElementById("rare-machines"),
  rareNote: document.getElementById("rare-note"),
};

const ctx = els.canvas.getContext("2d");

const galtonBoard = createGaltonBoard({
  planck,
  state,
  els,
  ctx,
  toW,
  toS,
  clamp,
  makeHexagonVertices,
  makeRotatedBoxVertices,
  normalizeWeights,
  currentParams,
  roundRect,
  drawHistogramStrip: (left, top, width, height) => drawHistogramStrip(ctx, state, left, top, width, height),
  drawStaticChart: (width, height) => drawStaticChart(ctx, state, roundRect, width, height),
});

const coinDiceScene = createCoinDiceScene({
  canvas: els.canvas3d,
  state,
});

const pachinkoDrawScene = createPachinkoDrawScene({
  canvas: els.canvas3d,
  state,
});

function getThreeScene(definition) {
  return definition.threeKind === "pachinko-draw" || definition.threeKind === "pachinko-draw-replace" ? pachinkoDrawScene : coinDiceScene;
}

function currentParams() {
  return state.params;
}

function formatCount(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}回` : "∞";
}

function formatAverage(value) {
  if (value == null || Number.isNaN(value)) return "-";
  if (!Number.isFinite(value)) return "∞";
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}回`;
}

function buildRareReport(params) {
  state.rareReport = simulateRarePachinkoDraw({
    probabilityPercent: params.probabilityPercent,
    machineCount: params.samples,
    seed: state.rngSeed,
  });
  state.samples = [];
  state.bins = Array.from({ length: state.rareReport.curvePoints.length }, () => 0);
  state.theoretical = [];
}

function sampleToBin(definition, rawValue, bins) {
  if (definition.render3d || definition.id === "normal" || definition.id === "binom" || definition.id === "hypergeom" || definition.id === "poisson") {
    return clamp(Math.round(rawValue), 0, bins - 1);
  }

  const params = currentParams();
  let domainMax = 1;
  if (definition.id === "expon") {
    domainMax = params.scale * 6;
  } else if (definition.id === "gamma") {
    domainMax = params.shape * params.scale * 4;
  } else if (definition.id === "lognorm") {
    domainMax = Math.exp(params.mu + params.sigma * 2.5);
  }

  const normalized = clamp(rawValue / Math.max(domainMax, 1e-6), 0, 0.999999);
  return clamp(Math.floor(normalized * bins), 0, bins - 1);
}

function buildHistogram(definition, params) {
  const bins = definition.binsFor(params);
  const samples = [];
  const histogram = Array.from({ length: bins }, () => 0);
  const random = rng(state.rngSeed);

  for (let i = 0; i < params.samples; i += 1) {
    const raw = definition.sample(params, random);
    const bin = sampleToBin(definition, raw, bins);
    samples.push(raw);
    histogram[bin] += 1;
  }

  state.samples = samples;
  state.bins = histogram;
  state.theoretical = normalizeWeights(definition.theoretical(params, bins), params.samples);
}

function setActive(id) {
  const definition = distributionSpecs[id];
  state.active = definition;
  state.params = cloneParams(definition.defaults);
  state.paused = false;
  els.pause.textContent = "一時停止";
  if (definition.rareAnalysis) {
    state.physics = null;
    state.threeScene = null;
    buildRareReport(state.params);
  } else if (definition.render3d) {
    state.physics = null;
    getThreeScene(definition).reset(definition.threeKind || definition.id, false);
  } else if (definition.physics) {
    galtonBoard.resetPhysics();
  } else {
    state.physics = null;
    buildHistogram(definition, state.params);
  }
  renderSelector();
  renderControls();
  renderDetails();
  resizeCanvas();
  kickLoop();
}

function renderSelector() {
  els.list.innerHTML = "";
  distributions.forEach((item) => {
    const button = document.createElement("button");
    button.className = `distribution-item${item.id === state.active.id ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<strong>${item.title}</strong><span>${item.tag} / ${item.shape}</span>`;
    button.addEventListener("click", () => setActive(item.id));
    els.list.appendChild(button);
  });
}

function renderControls() {
  els.parameterControls.innerHTML = "";
  const params = currentParams();

  state.active.controls.forEach((spec) => {
    const wrap = document.createElement("div");
    wrap.className = "param-control";

    const row = document.createElement("div");
    row.className = "param-control-row";

    const label = document.createElement("label");
    label.setAttribute("for", `param-${spec.key}`);
    label.textContent = spec.label;

    const output = document.createElement("output");
    output.id = `value-${spec.key}`;
    output.textContent = spec.format(params[spec.key]);

    row.append(label, output);

    const input = document.createElement("input");
    input.id = `param-${spec.key}`;
    input.type = spec.inputType || "range";
    if (spec.inputType === "number") {
      input.inputMode = "decimal";
    }
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(params[spec.key]);
    input.addEventListener("input", () => {
      const rawValue = Number(input.value);
      const numericValue = Number.isFinite(rawValue) ? rawValue : spec.min;
      const value = spec.inputType === "number"
        ? clamp(numericValue, spec.min, spec.max)
        : (spec.step === 1 ? Math.round(numericValue) : numericValue);
      state.params = {
        ...state.params,
        [spec.key]: value,
      };
      output.textContent = spec.format(value);
      if (state.active.rareAnalysis) {
        buildRareReport(state.params);
        renderDetails();
      } else if (state.active.render3d) {
        getThreeScene(state.active).reset(state.active.threeKind || state.active.id, false);
        renderDetails();
      } else if (state.active.physics) {
        galtonBoard.resetPhysics();
      } else {
        buildHistogram(state.active, state.params);
        renderDetails();
      }
      kickLoop();
    });

    wrap.append(row, input);
    els.parameterControls.appendChild(wrap);
  });
}

function renderDetails() {
  const params = currentParams();
  els.title.textContent = state.active.title;
  els.tag.textContent = state.active.tag;
  els.description.textContent = state.active.description;
  els.sampleCount.textContent = String(params.samples);
  els.binCount.textContent = String(state.bins.length || state.active.binsFor(params));
  els.shapeName.textContent = state.active.shape;

  els.evaluationList.innerHTML = "";
  state.active.evaluation.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.evaluationList.appendChild(li);
  });

  const peak = state.bins.length ? state.bins.reduce((best, value, index) => (value > state.bins[best] ? index : best), 0) : 0;
  els.peakBin.textContent = String(peak);

  const rareVisible = !!state.active.rareAnalysis;
  els.rareSummary.hidden = !rareVisible;
  if (rareVisible && state.rareReport) {
    const report = state.rareReport;
    els.peakBin.textContent = formatCount(report.maxObserved);
    els.rareAverage.textContent = formatAverage(report.averageAttempts);
    els.rareThreshold50.textContent = formatCount(report.threshold50);
    els.rareThreshold80.textContent = formatCount(report.threshold80);
    els.rareMachines.textContent = `${report.machineCount.toLocaleString("ja-JP")}台`;
    const noteParts = [
      `入力確率 ${report.probabilityPercent.toFixed(3)}%`,
      `理論上の 50% 到達は ${formatCount(report.theoretical50)}`,
      `理論上の 80% 到達は ${formatCount(report.theoretical80)}`,
    ];
    els.rareNote.textContent = noteParts.join(" / ");
  } else if (els.rareNote) {
    els.rareNote.textContent = "";
  }
}

function resizeCanvas() {
  const rect = els.canvas.parentElement.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  els.canvas.width = Math.floor(rect.width * ratio);
  els.canvas.height = Math.floor(rect.height * ratio);
  els.canvas3d.width = Math.floor(rect.width * ratio);
  els.canvas3d.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function syncCanvasVisibility() {
  const use3d = !!state.active.render3d;
  els.canvas.hidden = false; // always shown; overlays 3D canvas for histogram strip
  els.canvas3d.hidden = !use3d;
}

function drawLegend(width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "600 12px Trebuchet MS, sans-serif";
  ctx.fillText("3D histogram / particle impact map", 20, height - 18);
  ctx.restore();
}

function isAnimating() {
  if (state.active.render3d) {
    return !!(state.threeScene && state.threeScene.running && !state.threeScene.complete && !state.paused);
  }
  if (state.active.physics) {
    return !!(state.physics && state.physics.running && !state.physics.complete && !state.paused);
  }
  return false;
}

function kickLoop() {
  if (!loopRunning) {
    loopRunning = true;
    requestAnimationFrame(frame);
  }
}

function frame(now) {
  const dt = lastFrameTime > 0 ? Math.min(now - lastFrameTime, 50) : 16.667;
  lastFrameTime = now;
  const rect = els.canvas.parentElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  syncCanvasVisibility();
  if (state.active.render3d) {
    getThreeScene(state.active).step(dt);
    getThreeScene(state.active).render(width, height);
    ctx.clearRect(0, 0, width, height);
    if (state.bins.length > 0) {
      const stripH = Math.min(height * 0.28, 170);
      const stripTop = height - stripH;
      ctx.save();
      ctx.fillStyle = "rgba(4, 10, 20, 0.78)";
      ctx.fillRect(0, stripTop - 10, width, stripH + 10);
      ctx.restore();
      drawHistogramStrip(ctx, state, width * 0.04, stripTop, width * 0.92, stripH - 18);
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "600 11px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      const binW = (width * 0.92) / state.bins.length;
      for (let i = 0; i < state.bins.length; i++) {
        ctx.fillText(String(i + 1), width * 0.04 + i * binW + binW / 2, height - 4);
      }
      ctx.restore();
      // Progress counter
      const ts = state.threeScene;
      if (ts && ts.running && !ts.complete) {
        const mode = ts.mode;
        const isPachinkoDraw = mode === "pachinko-draw" || mode === "pachinko-draw-replace" || mode === "hypergeom";
        let label;
        if (isPachinkoDraw) {
          const trialN = Math.min(ts.trialIndex + 1, ts.total);
          label = `試行 ${trialN}/${ts.total}  投 ${ts.drawsDone ?? 0}/${ts.draws ?? '?'}`;
        } else {
          const trialN = Math.min(ts.completed + 1, ts.total);
          const currentTosses = ts.active?.trial?.tosses ?? 0;
          const isSingleFlip = mode === "bernoulli" || mode === "dice";
          const maxTosses = mode === "binom"
            ? ts.trialSize
            : mode === "geometric"
            ? ts.maxTries
            : ts.maxFailures;
          const tossN = Math.min(currentTosses + 1, maxTosses);
          label = isSingleFlip
            ? `コイン ${trialN}/${ts.total}`
            : `試行 ${trialN}/${ts.total}  投 ${tossN}/${maxTosses}`;
        }
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.52)";
        ctx.font = "600 12px Trebuchet MS, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, width * 0.04, stripTop - 14);
        ctx.restore();
      }
    }
  } else {
    ctx.clearRect(0, 0, width, height);
    drawBackground(ctx, width, height);
  }
  if (state.active.physics) {
    galtonBoard.stepPhysics(dt);
    galtonBoard.drawPhysicsStage(width, height);
  } else if (state.active.rareAnalysis) {
    drawRareProgression(ctx, state.rareReport, roundRect, width, height);
  } else if (!state.active.render3d) {
    drawStaticChart(ctx, state, roundRect, width, height);
  }

  if (state.paused) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "700 16px Trebuchet MS, sans-serif";
    ctx.fillText("paused", width - 86, 34);
    ctx.restore();
  } else if (state.active.physics && state.physics && state.physics.complete) {
    ctx.save();
    ctx.fillStyle = "rgba(107, 220, 255, 0.72)";
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillText("simulation complete", width - 178, 34);
    ctx.restore();
  } else if (state.active.render3d && state.threeScene && state.threeScene.complete) {
    ctx.save();
    ctx.fillStyle = "rgba(107, 220, 255, 0.72)";
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillText("simulation complete", width - 178, 34);
    ctx.restore();
  }

  if (!state.active.render3d && !state.active.rareAnalysis) {
    drawLegend(width, height);
  }
  if (isAnimating()) {
    requestAnimationFrame(frame);
  } else {
    loopRunning = false;
  }
}

// When tab is hidden, requestAnimationFrame stops. Run a setInterval fallback
// so physics and counting keep advancing even in background.
setInterval(() => {
  if (document.hidden && state.active.physics && !state.paused) {
    const now = performance.now();
    const dt = lastFrameTime > 0 ? Math.min(now - lastFrameTime, 50) : 16.667;
    lastFrameTime = now;
    galtonBoard.stepPhysics(dt);
  } else if (document.hidden && state.active.render3d && !state.paused) {
    const now = performance.now();
    const dt = lastFrameTime > 0 ? Math.min(now - lastFrameTime, 50) : 16.667;
    lastFrameTime = now;
    getThreeScene(state.active).step(dt);
  }
}, 20);

els.reroll.addEventListener("click", () => {
  state.rngSeed = (state.rngSeed + 1) >>> 0;
  if (state.active.rareAnalysis) {
    buildRareReport(state.params);
    renderDetails();
  } else if (state.active.render3d) {
    getThreeScene(state.active).reset(state.active.threeKind || state.active.id, true);
  } else if (state.active.physics) {
    galtonBoard.resetPhysics(true);
  } else {
    buildHistogram(state.active, state.params);
    renderDetails();
  }
  kickLoop();
});

els.pause.addEventListener("click", () => {
  const paused = !state.paused;
  if (state.active.render3d) {
    getThreeScene(state.active).setPaused(paused);
  } else if (state.active.physics) {
    galtonBoard.setPaused(paused);
  } else {
    state.paused = paused;
  }
  els.pause.textContent = paused ? "再開" : "一時停止";
  if (!paused) kickLoop();
});

function bootstrap() {
  renderSelector();
  renderControls();
  syncCanvasVisibility();
  if (state.active.rareAnalysis) {
    buildRareReport(state.params);
  } else if (state.active.render3d) {
    getThreeScene(state.active).reset(state.active.threeKind || state.active.id, false);
  } else if (state.active.physics) {
    galtonBoard.resetPhysics();
  } else {
    buildHistogram(state.active, state.params);
  }
  renderDetails();
  resizeCanvas();
  kickLoop();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) kickLoop();
});

try {
  bootstrap();
} catch (error) {
  console.error(error);
  els.description.textContent = `init failed: ${error.message}`;
}




