import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Import ESM regardless of the host site's package.json configuration.
const source = await readFile(new URL('../public/scoring.js', import.meta.url), 'utf8');
const { guidePoints, evaluateTrace } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
for (const symbol of ['O', 'M']) {
  test(`${symbol}: exact synthetic guide scores highly, deterministically`, () => {
    const strokes = [guidePoints(symbol)];
    const result = evaluateTrace(strokes, symbol, 'touch');
    assert.equal(result.score, 10);
    assert.equal(result.evaluationStatus, 'scored_experimental');
    assert.deepEqual(result, evaluateTrace(strokes, symbol, 'touch'));
    assert.deepEqual(result, evaluateTrace(strokes, symbol, 'pen'));
  });
  test(`${symbol}: partial trace cannot earn full score`, () => {
    const guide = guidePoints(symbol);
    const result = evaluateTrace([guide.slice(0, Math.floor(guide.length / 3))], symbol, 'touch');
    assert.ok(result.score > 0 && result.score <= 5);
  });
  test(`${symbol}: outside scribble and full-page paint get low scores`, () => {
    const border = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }];
    assert.ok(evaluateTrace([border], symbol, 'touch').score <= 2);
    const paint = Array.from({ length: 16 }, (_, i) => [{ x: 0, y: i / 15 }, { x: 1, y: i / 15 }]);
    assert.ok(evaluateTrace(paint, symbol, 'touch').score <= 3);
  });
}
test('mouse, mixed and unknown are unscorable, never zero', () => {
  for (const input of ['mouse', 'mixed', 'unknown', null]) {
    const result = evaluateTrace([guidePoints('O')], 'O', input);
    assert.equal(result.score, null);
    assert.equal(result.reason, 'UNSUPPORTED_INPUT');
  }
});
test('empty, point, invalid coordinates and unsupported symbol abstain', () => {
  for (const strokes of [[], [[]], [[{ x: .5, y: .5 }]], [[{ x: NaN, y: 0 }]], [[{ x: -1, y: 0 }, { x: 1, y: 1 }]]]) {
    assert.equal(evaluateTrace(strokes, 'O', 'touch').score, null);
  }
  assert.equal(evaluateTrace([guidePoints('O')], 'A', 'touch').reason, 'UNSUPPORTED_SYMBOL');
});
test('never joins separated strokes across a pen lift', () => {
  const points = guidePoints('M');
  const result = evaluateTrace([[points[0], points[1]], [points.at(-2), points.at(-1)]], 'M', 'pen');
  assert.ok(result.score === null || result.score <= 2);
});
test('input sampling density does not change a perfect synthetic trace', () => {
  const dense = guidePoints('M');
  const sparse = [{ x: .2, y: .8 }, { x: .2, y: .2 }, { x: .5, y: .55 }, { x: .8, y: .2 }, { x: .8, y: .8 }];
  assert.equal(evaluateTrace([dense], 'M', 'touch').score, evaluateTrace([sparse], 'M', 'touch').score);
});
test('excessive data abstains with an explicit limit', () => {
  const points = Array.from({ length: 12001 }, () => ({ x: .2, y: .2 }));
  assert.equal(evaluateTrace([points], 'M', 'touch').reason, 'TRACE_LIMIT');
});
