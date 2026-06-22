function createGaltonBoard(deps) {
  const {
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
  } = deps;

  let physicsAccumulator = 0;

  function resetPhysics(startImmediately = false) {
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
    const pegPitch = 24;
    const binWidth = pegPitch;
    // Fixed physical scale so step count changes do not resize the board.
    const PEG_R_PX = Math.max(4, Math.round(binWidth * 0.34));
    const BALL_R_PHY = Math.max(2, Math.round(binWidth * 0.14));
    const BALL_R_VIS = BALL_R_PHY;
    board.ballRadius = BALL_R_VIS;
    board.ballPhysicsR = BALL_R_PHY;
    const boardWidth = binWidth * bins;
    const startX = board.centerX - boardWidth / 2;
    const pegGapX = binWidth * 1.0;
    const pegGapY = pegGapX * (Math.sqrt(3) / 2);
    const pegBottomY = board.topY + (params.steps - 1) * pegGapY;
    board.binTopY = Math.min(height - 150, pegBottomY + 48);
    board.binBottomY = Math.min(height - 100, board.binTopY + 80);

    const biasP = definition.biasP ?? 0.5;
    const gravX = (definition.physicsMode === "biased")
      ? clamp((biasP - 0.5) * 2, -1, 1)
      : 0;
    const world = planck.World({ gravity: planck.Vec2(gravX, 15) });

    const pegs = [];
    const balls = [];
    const pegHexShape = planck.Polygon(makeHexagonVertices(toW(PEG_R_PX)));

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

    function addRotatedBox(cx, cy, hw, hh, angle, restitution = 0.1, friction = 0.1) {
      const b = world.createBody({ type: "static", position: planck.Vec2(toW(cx), toW(cy)) });
      b.createFixture({
        shape: planck.Polygon(makeRotatedBoxVertices(toW(hw), toW(hh), angle)),
        friction,
        restitution,
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
    const railLiftY = Math.max(18, Math.round(pegGapY * 0.85));
    const grTopY = Math.max(0, board.topY - railLiftY);
    const grBotY = pegBottomY;
    const grSpanX = ((params.steps - 1) / 2) * pegGapX;
    const grLiftSpanX = grSpanX * ((grBotY - grTopY) / Math.max(pegBottomY - board.topY, 1));
    const railGap = BALL_R_PHY * 3 + PEG_R_PX * 0.25;
    const leftRail = {
      topX: board.centerX - railGap,
      topY: grTopY,
      botX: board.centerX - grLiftSpanX - railGap,
      botY: grBotY,
    };
    const rightRail = {
      topX: board.centerX + railGap,
      topY: grTopY,
      botX: board.centerX + grLiftSpanX + railGap,
      botY: grBotY,
    };
    const leftRailAngle = Math.atan2(leftRail.botY - leftRail.topY, leftRail.botX - leftRail.topX);
    const rightRailAngle = Math.atan2(rightRail.botY - rightRail.topY, rightRail.botX - rightRail.topX);
    const railHalfThickness = Math.max(2, Math.round(BALL_R_PHY * 0.8));
    const leftRailMidX = (leftRail.topX + leftRail.botX) / 2;
    const leftRailMidY = (leftRail.topY + leftRail.botY) / 2;
    const rightRailMidX = (rightRail.topX + rightRail.botX) / 2;
    const rightRailMidY = (rightRail.topY + rightRail.botY) / 2;
    addRotatedBox(leftRailMidX, leftRailMidY, Math.hypot(leftRail.botX - leftRail.topX, leftRail.botY - leftRail.topY) / 2, railHalfThickness, leftRailAngle, 0.10, 0.15);
    addRotatedBox(rightRailMidX, rightRailMidY, Math.hypot(rightRail.botX - rightRail.topX, rightRail.botY - rightRail.topY) / 2, railHalfThickness, rightRailAngle, 0.10, 0.15);

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
      // Keep the existing guard rails, but widen the peg pyramid by one column
      // on each side so the visible outer contour follows the rails more closely.
      const count = row + 3;
      const rowWidth = (count - 1) * pegGapX;
      for (let i = 0; i < count; i += 1) {
        const px = board.centerX - rowWidth / 2 + i * pegGapX;
        const peg = world.createBody({ type: "static", position: planck.Vec2(toW(px), toW(py)) });
        const pegData = { type: "peg", row, col: i, hitCount: 0 };
        peg.createFixture({
          shape: pegHexShape,
          friction: 0.01,
          restitution: 0.43,
          userData: pegData,
        });
        peg.setUserData(pegData);
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
      pegData.hitCount += 1;
    });

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
      running: startImmediately,
      guardTopLX: leftRail.topX,
      guardTopRX: rightRail.topX,
      guardTopY: grTopY,
      guardBotLX: leftRail.botX,
      guardBotRX: rightRail.botX,
      guardBotY: grBotY,
      guardRailHalfThickness: railHalfThickness,
      total: params.samples,
      spawned: 0,
      settled: 0,
      spawnTimer: 0,
      spawnInterval: Math.max(90, Math.min(220, Math.round(9000 / Math.max(params.samples, 1)))),
      complete: false,
    };

    state.bins = Array.from({ length: bins }, () => 0);
    state.samples = [];
    state.theoretical = normalizeWeights(definition.theoretical(params, bins), params.samples);
    state.paused = false;
    els.pause.textContent = "一時停止";

    if (startImmediately) {
      spawnBall();
    }
  }

  function spawnBall() {
    const physics = state.physics;
    if (!physics || physics.spawned >= physics.total) return;
    const params = currentParams();
    const biasP = state.active.biasP ?? 0.5;

    const drift = state.active.physicsMode === "biased"
      ? clamp((biasP - 0.5) * 0.14, -0.08, 0.08)
      : 0;
    const jitter = (Math.random() - 0.5) * 1.5;
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
    ball.setLinearVelocity(planck.Vec2((Math.random() - 0.5) * 0.02 + drift * 0.18, 0.025));
    ball.setUserData({ type: "ball", captured: false, destroySoon: false });
    ball._r_px = physics.board.ballRadius;
    physics.balls.push(ball);
    physics.spawned += 1;
  }

  function stepPhysics(dtMs) {
    const physics = state.physics;
    if (!physics || state.paused || !physics.running) return;

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
      }
      if ((bd && bd.destroySoon) || py > physics.board.height + 80) {
        if (!bd || !bd.captured) {
          const px = toS(ball.getPosition().x);
          const idx = clamp(Math.floor((px - physics.startX) / physics.binWidth), 0, physics.bins - 1);
          state.bins[idx] += 1;
          state.samples.push(idx);
          physics.settled += 1;
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
    const pegHits = physicsPegHitSummary();

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
      pegHits,
    };
    console.log("[galton-sim] complete:", JSON.stringify(result));
    globalThis.__lastSimResult = result;
  }

  function physicsPegHitSummary() {
    const physics = state.physics;
    if (!physics) return null;
    const pegs = physics.pegs || [];
    if (!pegs.length) {
      return { pegs: 0, totalHits: 0, min: 0, max: 0, mean: 0, items: [] };
    }
    const items = pegs.map((peg) => {
      const pegData = peg.getUserData() || {};
      return {
        row: pegData.row,
        col: pegData.col,
        hitCount: pegData.hitCount || 0,
      };
    });
    const hitCounts = items.map((item) => item.hitCount);
    const sum = hitCounts.reduce((a, b) => a + b, 0);
    return {
      pegs: items.length,
      totalHits: sum,
      min: Math.min(...hitCounts),
      max: Math.max(...hitCounts),
      mean: +(sum / hitCounts.length).toFixed(3),
      items,
    };
  }

  function drawPhysicsStage(width, height) {
    const physics = state.physics;
    if (!physics) {
      drawStaticChart(width, height);
      return;
    }

    const { board, bins, binWidth, startX } = physics;
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
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(angle) * (r + 2);
        const py = y + Math.sin(angle) * (r + 2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = x - 2 + Math.cos(angle) * (r * 0.35);
        const py = y - 2 + Math.sin(angle) * (r * 0.35);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
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
    ctx.fillStyle = "rgba(180, 210, 255, 0.10)";
    ctx.strokeStyle = "rgba(180, 210, 255, 0.38)";
    ctx.lineWidth = 1.25;
    const railHalfThickness = physics.guardRailHalfThickness || 2;
    [
      [physics.guardTopLX, physics.guardTopY, physics.guardBotLX, physics.guardBotY],
      [physics.guardTopRX, physics.guardTopY, physics.guardBotRX, physics.guardBotY],
    ].forEach(([x1, y1, x2, y2]) => {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const length = Math.hypot(x2 - x1, y2 - y1);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const verts = makeRotatedBoxVertices(length / 2, railHalfThickness, angle);
      ctx.beginPath();
      verts.forEach((v, index) => {
        const px = midX + v.x;
        const py = midY + v.y;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();

    drawHistogramStrip(startX, board.binBottomY + 12, chartWidth, Math.max(48, height - board.binBottomY - 20));
  }

  return {
    resetPhysics,
    stepPhysics,
    drawPhysicsStage,
  };
}

globalThis.createGaltonBoard = createGaltonBoard;
