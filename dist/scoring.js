/** Experimental geometric practice feedback, NOT a validated literacy assessment.
 * Pure/local module. Coordinates are relative to the square writing area.
 * Do not reuse this rubric for unassisted writing or diagnostic conclusions.
 */
const VERSION = 'guided-experimental-v1';
const STEP = 0.012;
const TOLERANCE = 0.055;
const MAX_POINTS = 12000;
const MAX_SAMPLES = 4096;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = value => Math.max(0, Math.min(1, value));

function densify(points) {
  const result = points.length ? [{ ...points[0] }] : [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const steps = Math.max(1, Math.ceil(distance(a, b) / STEP));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}

export function guidePoints(symbol) {
  if (symbol === 'M') {
    return densify([{ x: .2, y: .8 }, { x: .2, y: .2 }, { x: .5, y: .55 }, { x: .8, y: .2 }, { x: .8, y: .8 }]);
  }
  if (symbol === 'O') {
    return Array.from({ length: 161 }, (_, i) => {
      const angle = 2 * Math.PI * i / 160 - Math.PI / 2;
      return { x: .5 + .3 * Math.cos(angle), y: .5 + .3 * Math.sin(angle) };
    });
  }
  return [];
}

function nearest(point, samples) {
  let best = Infinity;
  for (const other of samples) best = Math.min(best, distance(point, other));
  return best;
}

// Fixed-distance sampling per stroke prevents slow/high-frequency input from
// receiving more weight than an equally shaped fast stroke. Never bridge lifts.
function sampleStroke(stroke) {
  const samples = [{ ...stroke[0] }];
  let remaining = STEP;
  for (let i = 1; i < stroke.length; i++) {
    let a = stroke[i - 1];
    const b = stroke[i];
    let length = distance(a, b);
    while (length >= remaining && length > 0) {
      const t = remaining / length;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      samples.push(a);
      if (samples.length > MAX_SAMPLES) return null;
      length = distance(a, b);
      remaining = STEP;
    }
    remaining -= length;
  }
  samples.push({ ...stroke[stroke.length - 1] });
  return samples;
}

export function evaluateTrace(strokes, symbol, inputMethod) {
  const empty = reason => ({ score: null, evaluationStatus: 'unscorable', components: { coverage: 0, alignment: 0 }, scoringVersion: VERSION, reason });
  if (!['touch', 'pen'].includes(inputMethod)) return empty('UNSUPPORTED_INPUT');
  const guide = guidePoints(symbol);
  if (!guide.length) return empty('UNSUPPORTED_SYMBOL');
  if (!Array.isArray(strokes) || !strokes.length) return empty('EMPTY_TRACE');
  let pointCount = 0, totalLength = 0;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) return empty('INVALID_TRACE');
    pointCount += stroke.length;
    if (pointCount > MAX_POINTS || strokes.length > 256) return empty('TRACE_LIMIT');
    for (let i = 0; i < stroke.length; i++) {
      const point = stroke[i];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return empty('INVALID_TRACE');
      if (i) totalLength += distance(stroke[i - 1], point);
    }
  }
  if (!pointCount || totalLength < .025) return empty('INSUFFICIENT_TRACE');
  if (totalLength > 35) return empty('TRACE_LIMIT');
  const samples = [];
  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    const part = sampleStroke(stroke);
    if (!part || samples.length + part.length > MAX_SAMPLES) return empty('TRACE_LIMIT');
    samples.push(...part);
  }
  if (!samples.length) return empty('INSUFFICIENT_TRACE');
  const coverage = guide.filter(point => nearest(point, samples) <= TOLERANCE).length / guide.length;
  const alignment = samples.reduce((sum, point) => sum + clamp(1 - Math.max(0, nearest(point, guide) - STEP / 2) / (TOLERANCE * 2)), 0) / samples.length;
  // Product gate means a tiny accurate fragment or a full-page scribble cannot
  // get a high result from just coverage or just alignment. Provisional rubric.
  const score = Math.round(10 * coverage * alignment * alignment);
  return {
    score, evaluationStatus: 'scored_experimental',
    components: { coverage: +coverage.toFixed(4), alignment: +alignment.toFixed(4) },
    scoringVersion: VERSION, reason: 'EXPERIMENTAL_GEOMETRIC_FEEDBACK'
  };
}
