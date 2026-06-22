// planck.js (Box2D-system JS implementation)
// 1 physics meter = SCALE screen pixels
const SCALE = 50;
const toW = (px) => px / SCALE;  // pixels → meters
const toS = (m) => m * SCALE;    // meters → pixels
const GALTON_BIAS_P = 0.68;

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
    defaults: { samples: 500, steps: 14 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
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
    title: "二項分布",
    tag: "biased branching",
    shape: "非対称",
    description:
      "Galton と同じ舞台で、左右の偏りを変えて見せる。ボード全体に横方向の偏りを与えて実際の衝突をずらす。",
    evaluation: ["適切性: ◎", "見栄え: ○", "わかりやすさ: ◎", "物理演算: ◎"],
    defaults: { samples: 500, steps: 14 },
    controls: [
      { key: "samples", label: "サンプル数", min: 20, max: 120, step: 5, format: (v) => `${v}` },
      { key: "steps", label: "段数", min: 8, max: 20, step: 1, format: (v) => `${v}` },
    ],
    binsFor(params) {
      return params.steps + 1;
    },
    physics: true,
    physicsMode: "biased",
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
  drawHistogramStrip,
  drawStaticChart,
});

function cloneParams(params) {
  return JSON.parse(JSON.stringify(params));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeHexagonVertices(radius) {
  const verts = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    verts.push(planck.Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return verts;
}

function makeRotatedBoxVertices(hw, hh, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return corners.map(([x, y]) => planck.Vec2(
    x * cos - y * sin,
    x * sin + y * cos,
  ));
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
    galtonBoard.resetPhysics();
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
        galtonBoard.resetPhysics();
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
    galtonBoard.stepPhysics(dt);
    galtonBoard.drawPhysicsStage(width, height);
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
    galtonBoard.stepPhysics(dt);
  }
}, 20);

els.reroll.addEventListener("click", () => {
  state.rngSeed = (state.rngSeed + 1) >>> 0;
  if (state.active.physics) {
    galtonBoard.resetPhysics(true);
  } else {
    buildHistogram(state.active, state.params);
    renderDetails();
  }
});

function bootstrap() {
  renderSelector();
  renderControls();
  if (state.active.physics) {
    galtonBoard.resetPhysics();
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
