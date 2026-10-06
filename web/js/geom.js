// Small math helpers: 3D vectors, rotation, and 2D polyline tools.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

// ---- 3D ----
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function mm(A, B) {
  return A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
}

// yaw: turn left/right, pitch: nod up/down, roll: tilt ear to shoulder (radians)
export function rotation(yaw = 0, pitch = 0, roll = 0) {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  return mm(Rz, mm(Rx, Ry));
}
export const apply = (R, v) => [
  R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
  R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
  R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
];

// ---- 2D polylines ----
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polyLength(pts, closed = false) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 1) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

// Even spacing along a line, so wobble noise behaves the same on every stroke.
export function resample(pts, step, closed = false) {
  if (pts.length < 2) return pts.slice();
  const src = closed ? pts.concat([pts[0]]) : pts;
  const out = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const d = dist(a, b);
    if (d === 0) continue;
    let t = step - carry;
    while (t <= d) {
      out.push([a[0] + ((b[0] - a[0]) * t) / d, a[1] + ((b[1] - a[1]) * t) / d]);
      t += step;
    }
    carry = d - (t - step);
  }
  if (!closed) {
    const last = src[src.length - 1];
    if (dist(out[out.length - 1], last) > step * 0.3) out.push(last);
  } else if (out.length > 1 && dist(out[out.length - 1], out[0]) < step * 0.5) out.pop();
  return out;
}

export function chaikin(pts, iters = 1, closed = false) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = closed ? [] : [p[0]];
    const n = p.length;
    const lim = closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return a / 2;
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// Parallel lines across a polygon (for hatching). Returns [[x,y],[x,y]] segments.
export function scanPolygon(poly, angle, spacing, offset = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rp = poly.map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  const { y0, y1 } = bbox(rp);
  const segs = [];
  for (let y = y0 + offset; y < y1; y += spacing) {
    const xs = [];
    for (let i = 0, j = rp.length - 1; i < rp.length; j = i++) {
      const a = rp[j], b = rp[i];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const back = (x) => [x * c - y * s, x * s + y * c];
      segs.push([back(xs[k]), back(xs[k + 1])]);
    }
  }
  return segs;
}

// Split a list of items into consecutive runs where keep(item) is true.
export function runs(items, keep, minLen = 2) {
  const out = [];
  let cur = [];
  for (const it of items) {
    if (keep(it)) cur.push(it);
    else {
      if (cur.length >= minLen) out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= minLen) out.push(cur);
  return out;
}
