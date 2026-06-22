// planck.js (Box2D-system JS implementation)
// 1 physics meter = SCALE screen pixels
const SCALE = 50;
const toW = (px) => px / SCALE;  // pixels → meters
const toS = (m) => m * SCALE;    // meters → pixels

let physicsAccumulator = 0;
let lastFrameTime = 0;

const distributionSpecs = {
  normal: {
    id: "normal",
    title: "正規分布",
    tag: "galton board",
    shape: "釣鐘型",
    description:
      "Galton board の中心。左右分岐を繰り返した結果が、3D の積層としてまとまる。実際の衝突で釘を通過した結果を集計する。",
    evaluation: ["適切性: ◎", "見栄え: ◎", "わかりやすさ: ◎", "物理演算: ◎"],
    defaults: { samples: 80, steps: 14, p: 0.5 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
      { key: "steps", label: "段数", min: 8, max: 20, step: 1, format: (v) => `${v}` },
      { key: "p", label: "右へ進む確率 p", min: 0.1, max: 0.9, step: 0.01, format: (v) => v.toFixed(2) },
    ],
    binsFor(params) {
      return params.steps + 1;
    },
    physics: true,
    physicsMode: "galton",
    sample(params, rand) {
      return binomialSample(params.steps, params.p, rand);
    },
    theoretical(params, bins) {
      const mean = params.steps * params.p;
      const variance = params.steps * params.p * (1 - params.p);
      const sd = Math.sqrt(Math.max(variance, 1e-6));
      return gaussianProfile(bins, mean, sd);
    },
  },
  binom: {
    id: "binom",
    title: "二項分布",
    tag: "biased branching",
    shape: "非対称",
    description:
      "Galton と同じ舞台で、成功確率 p をずらして見せる。ボード全体に横方向の偏りを与えて実際の衝突をずらす。",
    evaluation: ["適切性: ◎", "見栄え: ○", "わかりやすさ: ◎", "物理演算: ◎"],
    defaults: { samples: 80, steps: 14, p: 0.68 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
      { key: "steps", label: "段数", min: 8, max: 20, step: 1, format: (v) => `${v}` },
      { key: "p", label: "成功確率 p", min: 0.05, max: 0.95, step: 0.01, format: (v) => v.toFixed(2) },
    ],
    binsFor(params) {
      return params.steps + 1;
    },
    physics: true,
    physicsMode: "biased",
    sample(params, rand) {
      return binomialSample(params.steps, params.p, rand);
    },
    theoretical(params, bins) {
      const weights = [];
      for (let k = 0; k < bins; k += 1) {
        weights.push(binomialPmf(params.steps, k, params.p));
      }
      return weights;
    },
  },
  hypergeom: {
    id: "hypergeom",
    title: "超幾何分布",
    tag: "without replacement",
    shape: "減少する母集団",
    description:
      "戻さない抽選を表す。物理箱の中の球を減らす演出で本質を見せる。",
    evaluation: ["適切性: ◎", "見栄え: ○", "わかりやすさ: ○", "物理演算: ○"],
    defaults: { samples: 80, population: 40, successes: 14, draws: 6 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
      { key: "population", label: "母集団サイズ", min: 12, max: 80, step: 1, format: (v) => `${v}` },
      { key: "successes", label: "成功個数", min: 1, max: 40, step: 1, format: (v) => `${v}` },
      { key: "draws", label: "取り出し数", min: 1, max: 12, step: 1, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.draws + 1;
    },
    physics: false,
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
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
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
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
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
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
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
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
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
  paused: false,
  rngSeed: 1337,
  physics: null,
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
};

const ctx = els.canvas.getContext("2d");

function cloneParams(params) {
  return JSON.parse(JSON.stringify(params));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rng() {
  state.rngSeed = (1664525 * state.rngSeed + 1013904223) >>> 0;
  return state.rngSeed / 4294967296;
}

function randomBetween(min, max) {
  return min + (max - min) * rng();
}

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result *= (n - k + i) / i;
  }
  return result;
}

function binomialSample(steps, p, rand) {
  let successes = 0;
  for (let i = 0; i < steps; i += 1) {
    if (rand() < p) successes += 1;
  }
  return successes;
}

function hypergeometricSample(population, successes, draws, rand) {
  let remainingPopulation = population;
  let remainingSuccesses = successes;
  let takenSuccesses = 0;
  for (let i = 0; i < draws; i += 1) {
    const p = remainingSuccesses / remainingPopulation;
    if (rand() < p) {
      takenSuccesses += 1;
      remainingSuccesses -= 1;
    }
    remainingPopulation -= 1;
  }
  return takenSuccesses;
}

function poissonSample(lambda, rand) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rand();
  } while (product > limit);
  return count - 1;
}

function exponentialSample(scale, rand) {
  return -Math.log(1 - rand()) * scale;
}

function gammaSample(shape, scale, rand) {
  let sum = 0;
  for (let i = 0; i < shape; i += 1) {
    sum += exponentialSample(scale, rand);
  }
  return sum;
}

function lognormalSample(mu, sigma, rand) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * normal);
}

function gaussianProfile(binCount, mean, sd) {
  const weights = [];
  for (let k = 0; k < binCount; k += 1) {
    const exponent = -((k - mean) ** 2) / (2 * sd * sd);
    weights.push(Math.exp(exponent));
  }
  return weights;
}

function binomialPmf(n, k, p) {
  return choose(n, k) * p ** k * (1 - p) ** (n - k);
}

function hypergeometricPmf(population, successes, draws, k) {
  const lower = Math.max(0, draws - (population - successes));
  const upper = Math.min(draws, successes);
  if (k < lower || k > upper) return 0;
  return (choose(successes, k) * choose(population - successes, draws - k)) / choose(population, draws);
}

function poissonPmf(lambda, k) {
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

function exponentialPdf(x, scale) {
  return x < 0 ? 0 : Math.exp(-x / scale) / scale;
}

function gammaPdf(x, shape, scale) {
  if (x < 0) return 0;
  const numerator = x ** (shape - 1) * Math.exp(-x / scale);
  const denominator = factorial(shape - 1) * scale ** shape;
  return numerator / denominator;
}

function lognormalPdf(x, mu, sigma) {
  if (x <= 0) return 0;
  const denom = x * sigma * Math.sqrt(2 * Math.PI);
  const exponent = -((Math.log(x) - mu) ** 2) / (2 * sigma * sigma);
  return Math.exp(exponent) / denom;
}

function normalizeWeights(weights, total) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (!sum) {
    return weights.map(() => 0);
  }
  return weights.map((value) => (value / sum) * total);
}

function currentParams() {
  return state.params;
}

function sampleToBin(definition, rawValue, bins) {
  if (definition.id === "normal" || definition.id === "binom" || definition.id === "hypergeom" || definition.id === "poisson") {
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

  for (let i = 0; i < params.samples; i += 1) {
    const raw = definition.sample(params, rng);
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
  if (definition.physics) {
    resetPhysics();
  } else {
    state.physics = null;
    buildHistogram(definition, state.params);
  }
  renderSelector();
  renderControls();
  renderDetails();
  resizeCanvas();
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
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(params[spec.key]);
    input.addEventListener("input", () => {
      const value = spec.step === 1 ? Math.round(Number(input.value)) : Number(input.value);
      state.params = {
        ...state.params,
        [spec.key]: value,
      };
      output.textContent = spec.format(value);
      if (state.active.physics) {
        resetPhysics();
      } else {
        buildHistogram(state.active, state.params);
        renderDetails();
      }
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
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  els.canvas.width = Math.floor(rect.width * ratio);
  els.canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (state.active.physics) {
    resetPhysics();
  }
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBackground(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#102036");
  gradient.addColorStop(0.55, "#0b1627");
  gradient.addColorStop(1, "#04070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height * 0.66);
  ctx.rotate(-0.12);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = -10; i <= 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-width, i * 34);
    ctx.lineTo(width, i * 34);
    ctx.stroke();
  }
  for (let i = -12; i <= 12; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 48, -height);
    ctx.lineTo(i * 48, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStaticChart(width, height) {
  const bins = state.bins.length;
  const left = width * 0.08;
  const top = height * 0.14;
  const chartWidth = width * 0.84;
  const chartHeight = height * 0.54;
  const binWidth = chartWidth / Math.max(bins, 1);
  const max = Math.max(1, ...state.bins, ...state.theoretical);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, left - 12, top - 12, chartWidth + 24, chartHeight + 24, 18);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < bins; i += 1) {
    const actual = state.bins[i] || 0;
    const theoretical = state.theoretical[i] || 0;
    const actualHeight = (actual / max) * chartHeight;
    const theoreticalHeight = (theoretical / max) * chartHeight;
    const x = left + i * binWidth;

    ctx.fillStyle = "rgba(245, 185, 66, 0.65)";
    ctx.fillRect(x + 1, top + chartHeight - actualHeight, binWidth - 5, actualHeight);
    ctx.fillStyle = "rgba(107, 220, 255, 0.85)";
    ctx.fillRect(x + 3, top + chartHeight - theoreticalHeight, binWidth - 9, 4);
  }

  ctx.save();
  ctx.fillStyle = "rgba(107, 220, 255, 0.9)";
  ctx.font = "600 11px Trebuchet MS, sans-serif";
  ctx.fillText("theoretical curve", left + 12, top + 14);
  ctx.restore();
}

function drawHistogramStrip(left, top, width, height) {
  const bins = state.bins.length;
  const binWidth = width / Math.max(bins, 1);
  const max = Math.max(1, ...state.bins, ...state.theoretical);

  for (let i = 0; i < bins; i += 1) {
    const actual = state.bins[i] || 0;
    const theoretical = state.theoretical[i] || 0;
    const actualHeight = (actual / max) * height;
    const theoreticalHeight = (theoretical / max) * height;
    const x = left + i * binWidth;

    ctx.fillStyle = "rgba(245, 185, 66, 0.65)";
    ctx.fillRect(x + 1, top + height - actualHeight, binWidth - 5, actualHeight);
    ctx.fillStyle = "rgba(107, 220, 255, 0.85)";
    ctx.fillRect(x + 3, top + height - theoreticalHeight, binWidth - 9, 4);
  }

  ctx.save();
  ctx.fillStyle = "rgba(107, 220, 255, 0.9)";
  ctx.font = "600 11px Trebuchet MS, sans-serif";
  ctx.fillText("theoretical curve", left + 12, top + 14);
  ctx.restore();
}

function drawPhysicsStage(width, height) {
  const physics = state.physics;
  if (!physics) {
    drawStaticChart(width, height);
    return;
  }

  const { board, bins, binWidth, startX } = physics;
  const baseY = board.binBottomY + 26;
  const chartWidth = binWidth * bins;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, startX - 22, board.topY - 34, chartWidth + 44, board.binBottomY - board.topY + 110, 20);
  ctx.fill();
  ctx.restore();

  // Bin walls
  ctx.save();
  ctx.strokeStyle = "rgba(230, 237, 255, 0.12)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= bins; i += 1) {
    const x = startX + i * binWidth;
    ctx.beginPath();
    ctx.moveTo(x, board.binTopY);
    ctx.lineTo(x, board.binBottomY + 12);
    ctx.stroke();
  }
  ctx.restore();

  // Pegs in front, centered and symmetric
  ctx.save();
  physics.pegs.forEach((peg) => {
    const pos = peg.getPosition();
    const x = toS(pos.x);
    const y = toS(pos.y);
    const r = peg._r_px;
    const grad = ctx.createRadialGradient(x - 2, y - 2, 2, x, y, r + 4);
    grad.addColorStop(0, "#fff7db");
    grad.addColorStop(0.42, "#ddb35c");
    grad.addColorStop(1, "#6e4f16");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Balls
  ctx.save();
  physics.balls.forEach((ball) => {
    const pos = ball.getPosition();
    const x = toS(pos.x);
    const y = toS(pos.y);
    const r = ball._r_px;
    const ballGrad = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, r + 4);
    ballGrad.addColorStop(0, "#fff5b7");
    ballGrad.addColorStop(0.38, "#f5b942");
    ballGrad.addColorStop(1, "#8f5d09");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(x - 2.2, y - 2.6, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Guard rails: single straight edge per side (no kink)
  ctx.save();
  ctx.strokeStyle = "rgba(180, 210, 255, 0.38)";
  ctx.lineWidth = 2;
  [
    [physics.guardTopLX, physics.guardTopY, physics.guardBotLX, physics.guardBotY],
    [physics.guardTopRX, physics.guardTopY, physics.guardBotRX, physics.guardBotY],
  ].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
  ctx.restore();

  drawHistogramStrip(startX, board.binBottomY + 12, chartWidth, Math.max(48, height - board.binBottomY - 20));
}

function drawLegend(width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "600 12px Trebuchet MS, sans-serif";
  ctx.fillText("3D histogram / particle impact map", 20, height - 18);
  ctx.restore();
}

function frame(now) {
  const dt = lastFrameTime > 0 ? Math.min(now - lastFrameTime, 50) : 16.667;
  lastFrameTime = now;
  const width = els.canvas.clientWidth;
  const height = els.canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawBackground(width, height);
  if (state.active.physics) {
    stepPhysics(dt);
    drawPhysicsStage(width, height);
  } else {
    drawStaticChart(width, height);
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
  }

  drawLegend(width, height);
  requestAnimationFrame(frame);
}

// When tab is hidden, requestAnimationFrame stops. Run a setInterval fallback
// so physics and counting keep advancing even in background.
setInterval(() => {
  if (document.hidden && state.active.physics && !state.paused) {
    const now = performance.now();
    const dt = lastFrameTime > 0 ? Math.min(now - lastFrameTime, 50) : 16.667;
    lastFrameTime = now;
    stepPhysics(dt);
  }
}, 20);

els.reroll.addEventListener("click", () => {
  state.rngSeed = (state.rngSeed + 1) >>> 0;
  if (state.active.physics) {
    resetPhysics();
  } else {
    buildHistogram(state.active, state.params);
    renderDetails();
  }
});

els.pause.addEventListener("click", () => {
  state.paused = !state.paused;
  els.pause.textContent = state.paused ? "再開" : "一時停止";
});

window.addEventListener("resize", () => {
  resizeCanvas();
});

function resetPhysics() {
  const definition = state.active;
  const params = currentParams();
  const width = els.canvas.clientWidth || 1;
  const height = els.canvas.clientHeight || 1;

  const board = {
    width,
    height,
    centerX: width * 0.5,
    topY: 95,
    binTopY: 0,
    binBottomY: 0,
    spawnY: 50,
    ballRadius: 0,
    ballPhysicsR: 0,
  };

  const bins = definition.binsFor(params);
  const binWidth = Math.max(30, Math.min(58, (width * 0.68) / bins));
  // Sizes proportional to bin width — pinR=binW/8, ballR=binW/8
  const PEG_R_PX   = Math.max(3, Math.round(binWidth / 8));
  const BALL_R_PHY = Math.max(3, Math.round(binWidth / 8));
  const BALL_R_VIS = BALL_R_PHY;
  board.ballRadius   = BALL_R_VIS;
  board.ballPhysicsR = BALL_R_PHY;
  const boardWidth = binWidth * bins;
  const startX = board.centerX - boardWidth / 2;
  const pegGapX = binWidth;
  const pegGapY = Math.min(30, Math.max(24, (height * 0.56) / Math.max(params.steps - 1, 1)));
  const pegBottomY = board.topY + (params.steps - 1) * pegGapY;
  board.binTopY = Math.min(height - 150, pegBottomY + 48);
  board.binBottomY = Math.min(height - 100, board.binTopY + 80);

  const gravX = (definition.physicsMode === "biased")
    ? clamp((params.p - 0.5) * 2, -1, 1)
    : 0;
  const world = planck.World({ gravity: planck.Vec2(gravX, 15) });

  const pegs = [];
  const balls = [];

  function addEdge(x1, y1, x2, y2, restitution = 0.1, friction = 0.1) {
    const b = world.createBody({ type: "static" });
    b.createFixture({
      shape: planck.Edge(planck.Vec2(toW(x1), toW(y1)), planck.Vec2(toW(x2), toW(y2))),
      friction,
      restitution,
    });
  }

  function addBox(cx, cy, hw, hh, userData, isSensor, restitution = 0.1) {
    const b = world.createBody({ type: "static", position: planck.Vec2(toW(cx), toW(cy)) });
    b.createFixture({
      shape: planck.Box(toW(hw), toW(hh)),
      friction: isSensor ? 0 : 0.1,
      restitution: isSensor ? 0 : restitution,
      isSensor: !!isSensor,
      userData: userData || null,
    });
    return b;
  }

  // Vertical outer safety walls
  const wallH = (board.binBottomY - board.topY) / 2;
  const wallMidY = (board.topY + board.binBottomY) / 2;
  addBox(startX - 10, wallMidY, 6, wallH, null, false, 0.1);
  addBox(startX + boardWidth + 10, wallMidY, 6, wallH, null, false, 0.1);

  // Pyramid guard rails — single straight edge per side, parallel to the
  // peg-pyramid diagonal (same slope as the pyramid boundary), offset 0.45
  // bin-widths outside. One Edge body per side = no kink = no ghost collisions.
  const grTopY = board.topY;
  const grBotY = pegBottomY;
  const grSpanX = ((params.steps - 1) / 2) * pegGapX;
  const railGap = PEG_R_PX + BALL_R_PHY * 2;
  const leftRail = {
    topX: board.centerX - railGap,
    topY: grTopY,
    botX: board.centerX - grSpanX - railGap,
    botY: grBotY,
  };
  const rightRail = {
    topX: board.centerX + railGap,
    topY: grTopY,
    botX: board.centerX + grSpanX + railGap,
    botY: grBotY,
  };
  addEdge(leftRail.topX, leftRail.topY, leftRail.botX, leftRail.botY, 0.10, 0.15);
  addEdge(rightRail.topX, rightRail.topY, rightRail.botX, rightRail.botY, 0.10, 0.15);

  // Bin dividers
  for (let i = 0; i <= bins; i += 1) {
    const x = startX + i * binWidth;
    addEdge(x, board.binTopY, x, board.binBottomY, 0.08, 0.2);
  }

  // Floor
  addEdge(startX - 20, board.binBottomY, startX + boardWidth + 20, board.binBottomY, 0.05, 0.5);

  // Bin sensor strips — thin horizontal triggers, one per bin
  for (let i = 0; i < bins; i += 1) {
    addBox(
      startX + (i + 0.5) * binWidth,
      board.binBottomY - 12,
      binWidth * 0.46, 8,
      { type: "binSensor", index: i },
      true,
    );
  }

  // Pegs
  for (let row = 0; row < params.steps; row += 1) {
    const py = board.topY + row * pegGapY;
    const count = row + 1;
    const rowWidth = (count - 1) * pegGapX;
    for (let i = 0; i < count; i += 1) {
      const px = board.centerX - rowWidth / 2 + i * pegGapX;
      const peg = world.createBody({ type: "static", position: planck.Vec2(toW(px), toW(py)) });
      peg.createFixture({
        shape: planck.Circle(toW(PEG_R_PX)),
        friction: 0.01,
        restitution: 0.43,
        userData: { type: "peg", row, col: i },
      });
      peg.setUserData({ type: "peg", row, col: i });
      peg._r_px = PEG_R_PX;
      pegs.push(peg);
    }
  }

  // Sensor contact: count ball into the appropriate bin
  world.on("begin-contact", (contact) => {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ua = fa.getUserData();
    const ub = fb.getUserData();
    const sensorData = (ua && ua.type === "binSensor") ? ua
                      : (ub && ub.type === "binSensor") ? ub : null;
    if (!sensorData) return;
    const ballBody = (sensorData === ua ? fb : fa).getBody();
    const bd = ballBody.getUserData();
    if (!bd || bd.type !== "ball" || bd.captured) return;
    bd.pendingBin = clamp(sensorData.index, 0, state.physics.bins - 1);
  });

  world.on("begin-contact", (contact) => {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const ua = fa.getUserData();
    const ub = fb.getUserData();
    const pegData = (ua && ua.type === "peg") ? ua
                  : (ub && ub.type === "peg") ? ub : null;
    if (!pegData) return;
    const ballBody = (pegData === ua ? fb : fa).getBody();
    const bd = ballBody.getUserData();
    if (!bd || bd.type !== "ball") return;
    if (!bd.hitRows) {
      bd.hitRows = new Set();
    }
    bd.hitRows.add(pegData.row);
  });

  // Visual pyramid outline (drawing only — no physics bodies)
  const pwLeftX  = startX;
  const pwRightX = startX + boardWidth;

  physicsAccumulator = 0;

  state.physics = {
    world,
    board,
    bins,
    binWidth,
    startX,
    boardWidth,
    pegs,
    balls,
    guardTopLX: leftRail.topX,
    guardTopRX: rightRail.topX,
    guardTopY: grTopY,
    guardBotLX: leftRail.botX,
    guardBotRX: rightRail.botX,
    guardBotY: grBotY,
    total: params.samples,
    spawned: 0,
    settled: 0,
    spawnTimer: 0,
    spawnInterval: Math.max(90, Math.min(220, Math.round(9000 / Math.max(params.samples, 1)))),
    complete: false,
    rowHitCounts: [],
  };

  state.bins = Array.from({ length: bins }, () => 0);
  state.samples = [];
  state.theoretical = normalizeWeights(definition.theoretical(params, bins), params.samples);
  state.paused = false;
  els.pause.textContent = "一時停止";

  spawnBall();
}

function spawnBall() {
  const physics = state.physics;
  if (!physics || physics.spawned >= physics.total) return;
  const params = currentParams();

  const drift = clamp((params.p - 0.5) * 0.22, -0.12, 0.12);
  const jitter = (Math.random() - 0.5) * 3;
  const x = physics.board.centerX + jitter + drift * physics.binWidth * 0.5;

  const ball = physics.world.createBody({
    type: "dynamic",
    position: planck.Vec2(toW(x), toW(physics.board.spawnY)),
    bullet: true,
    linearDamping: 0.008,
    angularDamping: 0.008,
  });
  ball.createFixture({
    shape: planck.Circle(toW(physics.board.ballPhysicsR)),
    density: 1.0,
    friction: 0.004,
    restitution: 0.48,
  });
  ball.setLinearVelocity(planck.Vec2((Math.random() - 0.5) * 0.035 + drift * 0.3, 0.04));
  ball.setUserData({ type: "ball", captured: false, destroySoon: false, hitRows: new Set() });
  ball._r_px = physics.board.ballRadius;
  physics.balls.push(ball);
  physics.spawned += 1;
}

function stepPhysics(dtMs) {
  const physics = state.physics;
  if (!physics || state.paused) return;

  physics.spawnTimer += dtMs;
  while (physics.spawnTimer >= physics.spawnInterval && physics.spawned < physics.total) {
    physics.spawnTimer -= physics.spawnInterval;
    spawnBall();
  }

  const FIXED_DT = 1 / 240;
  physicsAccumulator += dtMs / 1000;
  while (physicsAccumulator >= FIXED_DT) {
    physics.world.step(FIXED_DT, 12, 5);
    physicsAccumulator -= FIXED_DT;
  }

  // Remove balls that were counted by sensor or fell off-screen (fallback)
  physics.balls = physics.balls.filter((ball) => {
    const bd = ball.getUserData();
    const py = toS(ball.getPosition().y);
    const vel = ball.getLinearVelocity();
    const speed = Math.hypot(vel.x, vel.y);
    if (bd && bd.pendingBin != null && !bd.captured && py >= physics.board.binBottomY - 16 && speed < 1.15) {
      const idx = clamp(bd.pendingBin, 0, physics.bins - 1);
      bd.captured = true;
      bd.destroySoon = true;
      bd.resultLogged = true;
      state.bins[idx] += 1;
      state.samples.push(idx);
      physics.settled += 1;
      physics.rowHitCounts.push(bd.hitRows ? bd.hitRows.size : 0);
    }
    if ((bd && bd.destroySoon) || py > physics.board.height + 80) {
      if (!bd || !bd.captured) {
        const px = toS(ball.getPosition().x);
        const idx = clamp(Math.floor((px - physics.startX) / physics.binWidth), 0, physics.bins - 1);
        state.bins[idx] += 1;
        state.samples.push(idx);
        physics.settled += 1;
        physics.rowHitCounts.push(bd && bd.hitRows ? bd.hitRows.size : 0);
      } else if (bd && bd.captured && !bd.resultLogged) {
        physics.rowHitCounts.push(bd.hitRows ? bd.hitRows.size : 0);
        bd.resultLogged = true;
      }
      physics.world.destroyBody(ball);
      return false;
    }
    return true;
  });

  if (physics.spawned >= physics.total && physics.settled >= physics.total && !physics.complete) {
    physics.complete = true;
    logSimResults();
  }
}

function logSimResults() {
  const bins = state.bins;
  const total = bins.reduce((a, b) => a + b, 0);
  const theoretical = state.theoretical;
  if (!total) return;

  // Chi-square goodness-of-fit
  let chi2 = 0;
  for (let i = 0; i < bins.length; i += 1) {
    const expected = (theoretical[i] || 0) * total;
    if (expected > 0) chi2 += ((bins[i] - expected) ** 2) / expected;
  }
  const df = bins.length - 1;
  const mean = bins.reduce((s, v, i) => s + v * i, 0) / total;
  const variance = bins.reduce((s, v, i) => s + v * (i - mean) ** 2, 0) / total;

  // Peak bin
  const peak = bins.indexOf(Math.max(...bins));
  const hitRows = physicsRowHitSummary();

  const result = {
    distribution: state.active.id,
    total,
    bins,
    peak,
    mean: +mean.toFixed(3),
    sd: +Math.sqrt(variance).toFixed(3),
    chi2: +chi2.toFixed(2),
    df,
    expectedMean: +((bins.length - 1) / 2).toFixed(3),
    shape: bins[peak] > bins[0] && bins[peak] > bins[bins.length - 1] ? "bell" : "edge-heavy",
    rowHits: hitRows,
  };
  console.log("[galton-sim] complete:", JSON.stringify(result));
  window.__lastSimResult = result;
}

function physicsRowHitSummary() {
  const physics = state.physics;
  if (!physics) return null;
  const hitCounts = physics.rowHitCounts || [];
  if (!hitCounts.length) {
    return { balls: 0, min: 0, max: 0, mean: 0 };
  }
  const sum = hitCounts.reduce((a, b) => a + b, 0);
  return {
    balls: hitCounts.length,
    min: Math.min(...hitCounts),
    max: Math.max(...hitCounts),
    mean: +(sum / hitCounts.length).toFixed(3),
  };
}

function bootstrap() {
  renderSelector();
  renderControls();
  if (state.active.physics) {
    resetPhysics();
  } else {
    buildHistogram(state.active, state.params);
  }
  renderDetails();
  resizeCanvas();
  requestAnimationFrame(frame);
}

try {
  bootstrap();
} catch (error) {
  console.error(error);
  els.description.textContent = `init failed: ${error.message}`;
}
