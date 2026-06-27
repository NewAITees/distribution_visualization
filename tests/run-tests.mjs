import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {
  clamp,
  choose,
  binomialPmf,
  rng,
  binomialSample,
} from '../src/core/math.js';

const root = resolve(process.cwd());
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');
const mainJs = readFileSync(resolve(root, 'main.js'), 'utf8');

function extractIdsFromHtml(html) {
  const ids = new Set();
  const idPattern = /\bid="([^"]+)"/g;
  let match;
  while ((match = idPattern.exec(html)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

function extractDomIdsFromJs(source) {
  const ids = new Set();
  const pattern = /document\.getElementById\((['"])([^'"]+)\1\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    ids.add(match[2]);
  }
  return ids;
}

function approxEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function runDomContractChecks() {
  const htmlIds = extractIdsFromHtml(indexHtml);
  const jsIds = extractDomIdsFromJs(mainJs);
  const missing = [...jsIds].filter((id) => !htmlIds.has(id));

  assert.deepEqual(missing, []);
  assert.equal(htmlIds.has('scene'), true);
  assert.equal(htmlIds.has('scene-3d'), true);
  assert.equal(htmlIds.has('distribution-list'), true);
  assert.equal(htmlIds.has('reroll-button'), true);
  assert.equal(htmlIds.has('pause-button'), true);
}

function runMathChecks() {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(choose(5, 2), 10);
  approxEqual(binomialPmf(10, 5, 0.5), 0.24609375, 1e-8);

  const random = rng(42);
  assert.equal(binomialSample(10, 0, random), 0);
  assert.equal(binomialSample(10, 1, random), 10);
}

runDomContractChecks();
runMathChecks();

console.log('DOM contract: PASS');
console.log('Math smoke tests: PASS');
