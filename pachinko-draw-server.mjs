/**
 * Pachinko draw physics server — Node.js HTTP backend
 * Port: 18432
 *
 * POST /simulate  { population, successes, draws, samples }
 *   → runs all trials headless with spinner physics, returns distribution bins
 * GET  /logs
 *   → plain-text log of the last /simulate run
 */

import http from 'http';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPachinkoDrawWorld } from './src/scenes/pachinko-draw/physics-core.js';

await RAPIER.init({});

const PORT           = 18432;
const MAX_FRAMES     = 60 * 30;  // 30 s max per trial
const DT             = 1 / 60;

let lastLogs = ['(no simulation run yet)'];

// ── single trial ──────────────────────────────────────────────────────────────
function runTrial({ population, successSet, draws, trialIdx, logs }) {
  const sim = createPachinkoDrawWorld(RAPIER, {
    population,
    successIds: successSet,
    dt: DT,
  });

  let frame = 0;
  const drawLog = [];

  while (sim.exitOrder.length < draws && frame < MAX_FRAMES) {
    sim.step(DT);
    frame++;

    // Log each new exit
    while (drawLog.length < sim.exitOrder.length && drawLog.length < draws) {
      const ball = sim.exitOrder[drawLog.length];
      const n    = drawLog.length + 1;
      drawLog.push(`#${String(ball.id).padStart(2)} ${ball.success ? 'HIT' : 'miss'}`);
      logs.push(
        `[trial ${trialIdx}] draw ${String(n).padStart(2)}/${draws}` +
        `  ball=#${String(ball.id).padStart(2)}` +
        `  ${ball.success ? 'SUCCESS' : 'failure'}` +
        `  frame=${frame}  t=${(frame * DT).toFixed(2)}s`,
      );
    }
  }

  if (sim.exitOrder.length < draws) {
    logs.push(`[trial ${trialIdx}] WARNING: only ${sim.exitOrder.length}/${draws} balls exited in ${MAX_FRAMES} frames`);
  }

  const drawn        = sim.exitOrder.slice(0, draws);
  const successCount = drawn.filter(b => b.success).length;

  logs.push(
    `[trial ${trialIdx}] RESULT  successes=${successCount}/${draws}` +
    `  drawn=[${drawLog.join(' ')}]` +
    `  frames=${frame}  elapsed=${(frame * DT).toFixed(2)}s`,
  );

  return { successCount, totalFrames: frame, elapsed: frame * DT };
}

// ── run all trials ────────────────────────────────────────────────────────────
function simulate({ population, successes, draws, samples }) {
  const logs    = [];
  const bins    = Array(draws + 1).fill(0);
  const result  = [];
  let grandFrames = 0;
  let grandTime   = 0;
  const started   = Date.now();

  logs.push('=== pachinko-draw simulation start (spinner physics) ===');
  logs.push(`population=${population}  successes=${successes}  draws=${draws}  samples=${samples}`);
  logs.push(`dt=${DT}  MAX_FRAMES=${MAX_FRAMES}`);
  logs.push('');

  const ids = Array.from({ length: population }, (_, i) => i + 1);

  for (let t = 1; t <= samples; t++) {
    const shuffled   = [...ids].sort(() => Math.random() - 0.5);
    const successSet = new Set(shuffled.slice(0, successes));

    const trial = runTrial({ population, successSet, draws, trialIdx: t, logs });
    bins[trial.successCount]++;
    result.push(trial.successCount);
    grandFrames += trial.totalFrames;
    grandTime   += trial.elapsed;

    logs.push('');
  }

  const wallSec = ((Date.now() - started) / 1000).toFixed(1);
  const avg     = (result.reduce((a, b) => a + b, 0) / samples).toFixed(3);

  logs.push('=== simulation complete ===');
  logs.push(
    `trials=${samples}  avg_successes=${avg}  total_physics_frames=${grandFrames}` +
    `  physics_time=${grandTime.toFixed(1)}s  wall_time=${wallSec}s`,
  );

  return {
    logs,
    bins,
    samples: result,
    totalFrames: grandFrames,
    totalPhysicsTimeSec: parseFloat(grandTime.toFixed(2)),
    wallTimeSec: parseFloat(wallSec),
    summary: `${samples} trials completed. avg_successes=${avg}`,
  };
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/simulate') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let params;
    try { params = JSON.parse(body); }
    catch { res.writeHead(400); res.end('Invalid JSON'); return; }

    const { population = 36, successes = 10, draws = 5, samples = 20 } = params;

    if (
      population < 1 || successes < 0 || successes > population ||
      draws < 1 || draws > population || samples < 1
    ) {
      res.writeHead(400); res.end('Invalid parameters'); return;
    }

    console.log(`[${new Date().toISOString()}] /simulate  pop=${population} suc=${successes} draws=${draws} samples=${samples}`);

    const { logs, ...result } = simulate({ population, successes, draws, samples });
    lastLogs = logs;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'GET' && req.url === '/logs') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(lastLogs.join('\n'));
    return;
  }

  res.writeHead(404);
  res.end('Not found\n\nEndpoints:\n  POST /simulate\n  GET  /logs\n');
});

server.listen(PORT, () => {
  console.log(`pachinko-draw-server listening on http://localhost:${PORT}`);
  console.log('  POST /simulate  { "population":36, "successes":10, "draws":5, "samples":20 }');
  console.log('  GET  /logs');
});


