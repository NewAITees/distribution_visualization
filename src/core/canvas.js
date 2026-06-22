export function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

export function drawBackground(ctx, width, height) {
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

export function drawStaticChart(ctx, state, roundRectFn, width, height) {
  const bins = state.bins.length;
  const left = width * 0.08;
  const top = height * 0.14;
  const chartWidth = width * 0.84;
  const chartHeight = height * 0.54;
  const binWidth = chartWidth / Math.max(bins, 1);
  const max = Math.max(1, ...state.bins, ...state.theoretical);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRectFn(ctx, left - 12, top - 12, chartWidth + 24, chartHeight + 24, 18);
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

export function drawHistogramStrip(ctx, state, left, top, width, height) {
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
