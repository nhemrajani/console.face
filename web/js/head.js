// The invisible 3D head. Features are placed on its surface and projected
// to 2D, so when the head turns, everything foreshortens correctly.
//
// Surface coordinates: u = around the head (0 = nose, ±π/2 = ears, π = back)
//                      v = up/down (0 = eye level, +π/2 = crown, -π/2 = chin)
// Units: the head is roughly 2 units tall.

import { spow, smooth, add, mul, sub, cross, norm, rotation, apply } from "./geom.js";

export function makeHead(g) {
  // g: { rx: half-width, ry: half-height, rz: half-depth, jaw: 0..1 jaw width, square: <1 boxier }
  const point = (u, v) => {
    const cv = Math.cos(v), sv = Math.sin(v);
    const e = g.square;
    let x = g.rx * spow(cv, e) * spow(Math.sin(u), e);
    const y = g.ry * sv;
    let z = g.rz * spow(cv, e) * spow(Math.cos(u), e);
    if (sv < 0) {
      // narrow towards the jaw and chin
      const t = smooth(-sv / 0.95);
      x *= 1 - (1 - g.jaw) * Math.pow(t, 1.3);
      z *= 1 - (1 - g.jaw) * 0.4 * t * (Math.cos(u) < 0 ? 1.5 : 0.5);
    }
    if (Math.cos(u) < 0 && sv > -0.35) z *= 1.08; // fuller back of the skull
    return [x, y, z];
  };
  const clampV = (v) => Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, v));
  const normal = (u, v) => {
    v = clampV(v);
    const h = 1e-3;
    const du = sub(point(u + h, v), point(u - h, v));
    const dv = sub(point(u, v + h), point(u, v - h));
    return norm(cross(du, dv));
  };
  return { g, rx: g.rx, ry: g.ry, rz: g.rz, point, normal, clampV };
}

// Camera: rotate by the pose, then a gentle perspective projection to screen px.
export function makeView(pose, { S, cx, cy, persp = 7 }) {
  const R = rotation(pose.yaw || 0, pose.pitch || 0, pose.roll || 0);
  return {
    R,
    S,
    rot: (p) => apply(R, p),
    proj(p) {
      const q = apply(R, p);
      const f = persp / (persp - q[2]);
      return [cx + q[0] * S * f, cy - q[1] * S * f];
    },
    facing: (n) => apply(R, n)[2],
  };
}

export { add, mul };
