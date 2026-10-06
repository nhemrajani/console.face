// Turns a pile of small projected 3D patches into clean 2D outlines.
// We paint the patches into a tiny hidden canvas, then trace the edge of
// the painted blob. This gives correct silhouettes for any head shape and pose.

import { chaikin, resample, polyArea } from "./geom.js";

let canvas = null;

// erase: polygons cut out after painting; after: polygons painted back on top.
export function contoursOf(polys, { cell = 1.25, minArea = 25, smoothIters = 2, step = 2, erase = [], after = [] } = {}) {
  if (!polys.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  const pad = 3 * cell;
  const W = Math.ceil((x1 - x0 + 2 * pad) / cell) + 1;
  const H = Math.ceil((y1 - y0 + 2 * pad) / cell) + 1;
  if (!canvas) canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(1 / cell, 0, 0, 1 / cell, (pad - x0) / cell, (pad - y0) / cell);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = cell * 0.9;
  ctx.lineJoin = "round";
  for (const p of polys) {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (erase.length) {
    ctx.globalCompositeOperation = "destination-out";
    for (const p of erase) {
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const p of after) {
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  const grid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) grid[i] = data[i * 4 + 3] > 110 ? 1 : 0;

  // label connected blobs
  const label = new Int32Array(W * H);
  let next = 0;
  const blobs = [];
  for (let i = 0; i < W * H; i++) {
    if (!grid[i] || label[i]) continue;
    next++;
    let area = 0;
    const stack = [i];
    label[i] = next;
    while (stack.length) {
      const k = stack.pop();
      area++;
      const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (grid[nk] && !label[nk]) {
          label[nk] = next;
          stack.push(nk);
        }
      }
    }
    blobs.push({ id: next, start: i, area });
  }

  const out = [];
  for (const b of blobs) {
    if (b.area * cell * cell < minArea) continue;
    const px = trace(label, b.id, W, H, b.start % W, (b.start / W) | 0);
    if (px.length < 6) continue;
    let pts = px.map(([x, y]) => [x * cell + x0 - pad + cell / 2, y * cell + y0 - pad + cell / 2]);
    pts = resample(chaikin(pts, smoothIters, true), step, true);
    out.push(pts);
  }
  out.sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
  return out;
}

// Moore-neighbour boundary tracing.
const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function dirIndex(dx, dy) {
  for (let i = 0; i < 8; i++) if (D[i][0] === dx && D[i][1] === dy) return i;
  return 4;
}
function trace(label, id, W, H, sx, sy) {
  const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === id;
  const out = [[sx, sy]];
  let cx = sx, cy = sy, back = 4;
  let firstStep = null;
  for (let iter = 0; iter < W * H * 2; iter++) {
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const nx = cx + D[d][0], ny = cy + D[d][1];
      if (filled(nx, ny)) {
        const pd = (back + k - 1) % 8;
        const bx = cx + D[pd][0], by = cy + D[pd][1];
        cx = nx;
        cy = ny;
        back = dirIndex(bx - cx, by - cy);
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (firstStep === null) firstStep = [cx, cy];
    else if (out.length > 2 && cx === firstStep[0] && cy === firstStep[1] && out[out.length - 1][0] === sx && out[out.length - 1][1] === sy) {
      out.pop();
      break;
    }
    out.push([cx, cy]);
  }
  return out;
}
