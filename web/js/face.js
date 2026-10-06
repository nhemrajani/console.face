// THE SITTER: builds one face (a "genome" of choices) and draws it in the
// artist's style. For Milestone 1 the genome is random; from Milestone 5 it
// comes from a song's profile.

import { makeRng } from "./rng.js";
import { makeHead, makeView } from "./head.js";
import { Drawing } from "./ink.js";
import { contoursOf } from "./mask.js";
import { add, mul, norm, dot, lerp, clamp, smooth, runs, chaikin, dist, pointInPoly, polyArea, resample } from "./geom.js";

export const FRAME = { width: 300, height: 360 };
const S = 82, CX = 150, CY = 150;
const PI = Math.PI;

// ---------------------------------------------------------------------
// Random face genome, shaped by the artist's habits.
// ---------------------------------------------------------------------
export function randomFace(seed, style) {
  const r = makeRng("face:" + seed);
  const ex = style.exaggeration;
  const vr = style.variety;
  const sp = (a, b) => lerp((a + b) / 2, a, vr) + (lerp((a + b) / 2, b, vr) - lerp((a + b) / 2, a, vr)) * r.next();

  const hairStyle = r.weighted({
    short: 3, messy: 2, curly: 1.5, afro: 0.8, swept: 2, long: 2, wavy: 1.5, bun: 1, fringe: 1.2, buzz: 1, bald: 0.4,
  });
  const smile = r.range(-0.7, 0.9);
  return {
    seed,
    head: {
      rx: sp(0.7, 0.86) * (1 + r.range(0, 0.18) * ex) * (1 - style.elongation * 0.35),
      ry: (1 + style.elongation) * (1 + r.range(-0.07, 0.1) * vr),
      rz: r.range(0.84, 0.95),
      jaw: sp(0.48, 0.86),
      square: clamp(lerp(0.66, 1.0, style.roundness) + r.range(-0.1, 0.1) * vr, 0.55, 1.05),
    },
    eyes: {
      type: r.weighted(style.eyeWeights),
      u: sp(0.3, 0.4),
      v: r.range(-0.04, 0.06),
      w: sp(0.095, 0.13) * (1 + r.range(0.2, 0.9) * ex),
      h: r.range(0.45, 0.72),
      lid: clamp((r.chance(0.35) ? r.range(0.25, 0.55) : r.range(0, 0.15)) + style.droop * 0.35, 0, 0.7),
      tilt: r.range(-0.6, 0.6),
      gaze: [r.range(-0.7, 0.7), r.range(-0.4, 0.3)],
      lashes: r.chance(0.3),
    },
    brows: { thick: r.range(0.7, 1.7), arch: r.range(0, 0.045), tilt: r.range(-0.7, 0.7), lift: r.range(0.15, 0.22), w: r.range(0.12, 0.17), kind: r.weighted({ line: 3, hairy: 1.2, block: style.fillBlacks + 0.2 }) },
    nose: { kind: r.weighted({ L: 3, button: 1.5 + ex * 2, long: 1.5, wide: 1 }), len: sp(0.24, 0.36), proj: r.range(0.1, 0.2) * (1 + ex * 0.5), w: sp(0.07, 0.13) * (1 + ex * 0.4), side: r.sign() },
    mouth: { v: r.range(-0.66, -0.55), w: sp(0.13, 0.22) * (1 + ex * 0.3), smile, open: r.chance(0.28) ? r.range(0.3, 1) : 0, smirk: r.chance(0.4) ? r.range(-0.8, 0.8) : 0, lip: r.chance(0.55) },
    ears: { size: sp(0.18, 0.25) * (1 + ex * r.range(0, 0.4)), stick: r.range(0.2, 1), v: r.range(-0.18, -0.08) },
    hair: {
      style: hairStyle,
      front: r.range(0.36, 0.6),
      side: r.range(-0.02, 0.14),
      back: r.range(-0.6, -0.35),
      sweep: r.range(-1, 1),
      fill: r.chance(style.fillBlacks * 0.8) ? "solid" : r.chance(0.35) ? "hatch" : "none",
      length: r.range(1.45, 2.3),
    },
    details: {
      freckles: r.chance(0.3) ? r.int(8, 30) * style.detail : 0,
      stubble: r.chance(0.25) ? r.range(0.4, 1) : 0,
      wrinkles: r.chance(0.35) ? r.range(0.3, 1) * (0.5 + style.detail) : 0,
      moles: r.chance(0.3) ? r.int(1, 2) : 0,
      blush: r.chance(0.2 + 0.3 * style.exaggeration),
    },
    acc: {
      glasses: r.chance(0.2) ? r.pick(["round", "square", "sun"]) : null,
      earring: r.chance(0.22),
      chain: r.chance(0.15),
      beanie: r.chance(0.08),
      headphones: r.chance(0.07),
      tear: r.chance(0.08),
    },
    body: { neckW: r.range(0.24, 0.33) * (1 - style.elongation * 0.4), shoulders: r.range(1.35, 1.8), top: r.pick(["crew", "crew", "v", "collar", "hoodie"]), dark: r.chance(style.fillBlacks * 0.6) },
    pose: {
      yaw: r.range(-1, 1) * (0.1 + style.tilt * 1.1),
      pitch: r.range(-0.12, 0.1),
      roll: r.range(-1, 1) * style.tilt * 0.6,
    },
  };
}

// ---------------------------------------------------------------------
// Draw a face genome in a style. Returns the Drawing (ordered marks).
// ---------------------------------------------------------------------
export function drawFace(face, style, poseOverride) {
  const pose = poseOverride ?? face.pose;
  const H = makeHead(face.head);
  const V = makeView(pose, { S, cx: CX, cy: CY });
  const Vneck = makeView({ yaw: pose.yaw * 0.55, pitch: pose.pitch * 0.2, roll: pose.roll * 0.5 }, { S, cx: CX, cy: CY });
  const Vbody = makeView({ yaw: pose.yaw * 0.2, pitch: 0, roll: pose.roll * 0.25 }, { S, cx: CX, cy: CY });
  const dr = new Drawing(style, face.seed);
  const r = makeRng("draw:" + face.seed);
  const light = norm([-0.55, 0.5, 0.65]);

  const surf = (u0, v0, a, b, c = 0) => {
    const v = H.clampV(v0 + b / H.ry);
    const u = u0 + a / (H.rx * Math.max(0.3, Math.cos(v)));
    const n = H.normal(u, v);
    return { P: add(H.point(u, v), mul(n, c)), N: n };
  };
  const P2 = (s) => V.proj(s.P);
  const vis = (s, t = 0) => V.facing(s.N) > t;
  const curve = (samples, o = {}) => {
    for (const run of runs(samples, (s) => vis(s, o.vis ?? 0.0), 2)) dr.stroke(run.map(P2), o);
  };
  const sampleT = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));

  // ---- head surface grid (for silhouettes and shading) ----
  const NU = 64, NV = 36;
  const grid = [];
  for (let i = 0; i <= NU; i++) {
    const u = -PI + (2 * PI * i) / NU;
    const row = [];
    for (let j = 0; j <= NV; j++) {
      const v = -PI / 2 + 0.03 + ((PI - 0.06) * j) / NV;
      const p = H.point(u, v), n = H.normal(u, v);
      row.push({ u, v, s: V.proj(p), nr: V.rot(n) });
    }
    grid.push(row);
  }
  const quads = (keep) => {
    const out = [];
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        if (!keep || keep(q)) out.push(q.map((g) => g.s));
      }
    return out;
  };
  const headPoly = contoursOf(quads())[0];
  const frontSign = Math.sign(polyArea([V.proj(H.point(-0.1, -0.1)), V.proj(H.point(0.1, -0.1)), V.proj(H.point(0.1, 0.1)), V.proj(H.point(-0.1, 0.1))]));

  const hair = face.hair;
  const hasCurtain = ["long", "wavy", "fringe"].includes(hair.style);
  const hairOverEars = hasCurtain;

  // ================= drawing order (also the sketching order) =================

  // 1. construction lines: the faint guides some artists leave in
  if (style.construction > 0.05) {
    dr.setGroup("construction");
    const o = { weight: 0.35, opacity: 0.18 + 0.3 * style.construction, wobble: 0.6, passes: 1, taper: 0.8 };
    const c = V.proj([0, 0.12, 0]);
    const rad = H.rx * S * 1.02;
    dr.stroke(sampleT(40, (t) => [c[0] + Math.cos(t * 2 * PI) * rad, c[1] + Math.sin(t * 2 * PI) * rad * 1.02]), { ...o, closed: true });
    curve(sampleT(30, (t) => surf(0, lerp(1.25, -1.45, t), 0, 0, 0.0)), { ...o, vis: 0.05 });
    curve(sampleT(30, (t) => surf(lerp(-1.4, 1.4, t), face.eyes.v, 0, 0, 0)), { ...o, vis: 0.05 });
  }

  // 2. hair that hangs behind (the body will hide the part behind the shoulders)
  if (hasCurtain) {
    dr.setGroup("hair-back");
    drawCurtain();
  }

  // 3. body and clothes
  dr.setGroup("body");
  drawBody();

  // 4. neck
  dr.setGroup("neck");
  drawNeck();
  if (face.acc.chain) drawChain();

  // 5. ears on the far side / front view (head will cover their inner part)
  const nearSide = Math.abs(pose.yaw) > 0.35 ? -Math.sign(pose.yaw) : 0;
  dr.setGroup("ears");
  if (!hairOverEars) for (const side of [-1, 1]) if (side !== nearSide) drawEar(side);

  // 6. head outline
  dr.setGroup("head");
  dr.fill(headPoly);
  dr.stroke(headPoly, { closed: true, weight: 1.15, breaks: style.lineBreaks });

  // 7. shading
  if (style.shadow > 0.08) {
    dr.setGroup("shading");
    const thr = -0.08 + 0.42 * style.shadow;
    const shadeQ = quads((q) => q.every((g) => g.nr[2] > 0.03) && dot(avg(q.map((g) => g.nr)), light) < thr);
    for (const poly of contoursOf(shadeQ, { minArea: 120 })) dr.hatch(poly, { weight: 0.42 });
  }

  // 8. ear on the near side when the head is turned
  dr.setGroup("ears");
  if (!hairOverEars && nearSide) drawEar(nearSide);

  // 9. skin details, then the features
  dr.setGroup("details");
  drawDetails();
  dr.setGroup("eyes");
  for (const side of [-1, 1]) drawEye(side);
  dr.setGroup("brows");
  for (const side of [-1, 1]) drawBrow(side);
  dr.setGroup("nose");
  drawNose();
  dr.setGroup("mouth");
  drawMouth();
  if (face.acc.tear) drawTear();

  // 10. hair on top
  dr.setGroup("hair");
  if (face.acc.beanie) drawBeanie();
  else if (hair.style !== "bald") drawHairCap();

  // 11. accessories
  dr.setGroup("accessories");
  if (face.acc.glasses) drawGlasses(face.acc.glasses);
  if (face.acc.headphones) drawHeadphones();

  return dr;

  // ======================= feature functions =======================

  function drawBody() {
    const b = face.body;
    const nw = b.neckW, sw = b.shoulders;
    const B = (x, y, z = -0.1) => Vbody.proj([x, y, z]);
    const left = [[-nw * 1.1, -1.3], [-nw * 1.7, -1.45], [-sw * 0.8, -1.62], [-sw * 0.97, -1.86], [-sw * 1.05, -2.25], [-sw * 1.08, -3.0]];
    const L = chaikin(left.map(([x, y]) => B(x, y)), 2);
    const R = chaikin(left.map(([x, y]) => B(-x, y)), 2);
    dr.fill([...L, ...R.slice().reverse()]);
    let neckline;
    if (b.top === "v") neckline = [[-nw * 1.15, -1.36], [-nw * 0.5, -1.65], [0, -1.92], [nw * 0.5, -1.65], [nw * 1.15, -1.36]];
    else neckline = [[-nw * 1.3, -1.36], [-nw * 0.8, -1.55], [0, -1.62], [nw * 0.8, -1.55], [nw * 1.3, -1.36]];
    const NL = chaikin(neckline.map(([x, y]) => B(x, y, 0.05)), 2);
    if (b.dark) {
      const shirt = [...NL, ...R.slice(2), ...L.slice(2).reverse()];
      if (style.fillBlacks > 0.45) dr.fill(shirt, { color: "ink", opacity: 0.9 });
      else dr.hatch(shirt, { spacing: 0.9, weight: 0.5, style: style.hatchStyle === "stipple" ? "parallel" : undefined });
    }
    dr.stroke(L, { weight: 1.1 });
    dr.stroke(R, { weight: 1.1 });
    if (b.top === "hoodie") {
      const hood = [[-nw * 2.3, -1.65], [-nw * 2.2, -1.25], [-nw * 1.5, -1.08], [nw * 1.5, -1.08], [nw * 2.2, -1.25], [nw * 2.3, -1.65]];
      dr.stroke(chaikin(hood.map(([x, y]) => B(x, y, -0.2)), 2), { weight: 1 });
      dr.stroke(NL, { weight: 1 });
      for (const s of [-1, 1]) dr.stroke([B(s * nw * 0.55, -1.6, 0.1), B(s * nw * 0.62, -1.9, 0.1), B(s * nw * 0.58, -2.15, 0.1)], { weight: 0.7 });
    } else if (b.top === "collar") {
      for (const s of [-1, 1]) {
        dr.stroke([B(s * nw * 1.05, -1.25), B(s * nw * 1.75, -1.55), B(s * nw * 0.25, -1.78), B(s * nw * 0.05, -1.45)], { weight: 1, closed: false });
      }
      dr.stroke([B(0, -1.78), B(0, -3)], { weight: 0.8 });
      for (const y of [-2.05, -2.45]) {
        const p = B(nw * 0.12, y);
        dr.dot(p[0], p[1], 1.4);
      }
    } else {
      dr.stroke(NL, { weight: 1 });
      if (b.top === "crew") dr.stroke(chaikin(neckline.map(([x, y]) => B(x * 1.08, y - 0.07, 0.05)), 2), { weight: 0.6 });
    }
    // a couple of fold lines
    if (style.detail > 0.35) for (const s of [-1, 1]) dr.stroke([B(s * sw * 0.72, -2.2), B(s * sw * 0.6, -2.5), B(s * sw * 0.62, -2.7)], { weight: 0.5 });
  }

  function drawNeck() {
    const nw = face.body.neckW;
    const N = (x, y) => Vneck.proj([x, y, -0.18]);
    const l = chaikin([[-nw, -0.35], [-nw * 0.98, -0.9], [-nw * 1.08, -1.25], [-nw * 1.25, -1.42]].map(([x, y]) => N(x, y)), 2);
    const rr = chaikin([[nw, -0.35], [nw * 0.98, -0.9], [nw * 1.08, -1.25], [nw * 1.25, -1.42]].map(([x, y]) => N(x, y)), 2);
    dr.fill([...l, ...rr.slice().reverse()]);
    if (style.shadow > 0.12) {
      const band = [N(-nw * 1.02, -0.4), N(nw * 1.02, -0.4), N(nw * 1.0, -0.98), N(-nw * 1.0, -0.98)];
      dr.hatch(band, { weight: 0.42, angle: style.hatchAngle + 0.3, cross: false });
    }
    dr.stroke(l, { weight: 1 });
    dr.stroke(rr, { weight: 1 });
    if (face.head.jaw < 0.62 && r.chance(0.5)) dr.stroke([N(0.02, -1.05), N(-0.01, -1.12)], { weight: 0.6 });
  }

  function drawChain() {
    const nw = face.body.neckW;
    const pts = sampleT(16, (t) => Vbody.proj([lerp(-nw * 1.1, nw * 1.1, t), -1.32 - Math.sin(t * PI) * 0.42, 0.1]));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const len = dist(a, b) * 0.62, wid = i % 2 ? 1.2 : 2.2;
      const loop = sampleT(10, (t) => [m[0] + Math.cos(t * 2 * PI) * len * Math.cos(ang) - Math.sin(t * 2 * PI) * wid * Math.sin(ang), m[1] + Math.cos(t * 2 * PI) * len * Math.sin(ang) + Math.sin(t * 2 * PI) * wid * Math.cos(ang)]);
      dr.stroke(loop, { weight: 0.55, passes: 1, noOvershoot: true });
    }
  }

  function earGeom(side) {
    const e = face.ears;
    const ang = 0.85;
    const base = H.point(side * (PI / 2 - 0.3), e.v);
    const eOut = [side * Math.sin(ang), 0, -Math.cos(ang)];
    const up = [0, 1, 0];
    const h = e.size, w = e.size * 0.5 * (0.75 + e.stick * 0.6);
    const toP = ([x, y]) => V.proj(add(base, add(mul(eOut, x * w), mul(up, y * h))));
    const outer = chaikin([[0, 0.5], [0.4, 0.6], [0.85, 0.48], [1, 0.15], [0.88, -0.22], [0.6, -0.45], [0.3, -0.58], [0.06, -0.5]], 2).map(toP);
    const inner = chaikin([[0.25, 0.3], [0.58, 0.32], [0.68, 0.05], [0.5, -0.18], [0.32, -0.12]], 2).map(toP);
    return { outer, inner, lobe: toP([0.3, -0.62]) };
  }

  function drawEar(side) {
    const g = earGeom(side);
    dr.fill(g.outer.concat([g.outer[0]]));
    dr.stroke(g.outer, { weight: 1.05 });
    dr.stroke(g.inner, { weight: 0.6 });
    if (face.acc.earring) {
      const [x, y] = g.lobe;
      if (face.seed.length % 2) dr.stroke(sampleT(14, (t) => [x + Math.sin(t * 2 * PI) * 3, y + 3 - Math.cos(t * 2 * PI) * 3.4]), { weight: 0.6, closed: true, noOvershoot: true });
      else dr.dot(x, y + 1, 1.5);
    }
  }

  function drawEye(side) {
    const e = face.eyes;
    const u0 = side * e.u, v0 = e.v;
    const w = e.w, h = e.w * e.h;
    const L = (a, b, c = 0.012) => surf(u0, v0, a, b, c);
    if (!vis(L(0, 0), 0.08)) return;
    const Q = (a, b, c) => P2(L(a, b, c));
    const [gx, gy] = e.gaze;
    const smile = face.mouth.smile;

    if (e.type === "sleepy") {
      const happy = smile > 0.35;
      const pts = sampleT(14, (t) => {
        const a = lerp(-w, w, t), q = a / w;
        return Q(a, (happy ? 1 : -1) * h * 0.35 * (1 - q * q) + e.tilt * 0.02 * q * side);
      });
      dr.stroke(pts, { weight: 1.2 });
      if (!happy) for (const k of [0.45, 0.75]) dr.stroke([Q(side * w * k, -h * 0.28 * (1 - k * k)), Q(side * w * (k + 0.12), -h * 0.28 * (1 - k * k) - h * 0.45)], { weight: 0.55, noOvershoot: true });
      return;
    }

    if (e.type === "dot") {
      const R = w * 0.32;
      const cx = gx * w * 0.3, cy = gy * R * 0.4;
      const cap = R * (1 - 2 * e.lid * 1.1);
      const poly = sampleT(16, (t) => Q(cx + Math.cos(t * 2 * PI) * R, cy + Math.min(cap, Math.sin(t * 2 * PI) * R * 1.15)));
      dr.fill(poly, { color: "ink", opacity: style.inkOpacity });
      if (e.lid > 0.2) dr.stroke([Q(cx - R * 1.6, cy + cap), Q(cx + R * 1.6, cy + cap + e.tilt * 0.01 * side)], { weight: 0.9 });
      else if (r.chance(0.5)) {
        const [hx, hy] = Q(cx - R * 0.35, cy + R * 0.4);
        dr.dot(hx, hy, Math.max(0.7, R * S * 0.18), { color: "paper" });
      }
      return;
    }

    const upper = (a) => {
      const q = clamp(a / w, -1, 1);
      return h * Math.pow(1 - q * q, 0.75) * (1 - 0.5 * e.lid) + e.tilt * 0.03 * q * side;
    };
    const lower = (a) => {
      const q = clamp(a / w, -1, 1);
      return -h * 0.62 * Math.pow(1 - q * q, 0.9) + e.tilt * 0.03 * q * side;
    };

    if (e.type === "round") {
      const R = w * 0.62;
      const circ = sampleT(28, (t) => Q(Math.cos(t * 2 * PI) * R, Math.sin(t * 2 * PI) * R));
      dr.fill(circ);
      const lidY = R * (1 - 2 * e.lid);
      const pr = R * 0.45;
      const pcx = clamp(gx, -1, 1) * (R - pr) * 0.8, pcy = clamp(gy, -1, 1) * (R - pr) * 0.6;
      const pupil = sampleT(16, (t) => Q(pcx + Math.cos(t * 2 * PI) * pr, Math.min(lidY, pcy + Math.sin(t * 2 * PI) * pr)));
      dr.fill(pupil, { color: "ink", opacity: style.inkOpacity });
      dr.stroke(circ, { closed: true, weight: 1 });
      if (e.lid > 0.2) {
        const xL = Math.sqrt(Math.max(0, R * R - lidY * lidY));
        dr.stroke([Q(-xL, lidY), Q(0, lidY + R * 0.06), Q(xL, lidY)], { weight: 0.9 });
      }
      return;
    }

    // almond (detailed) eye
    const top = sampleT(18, (t) => [lerp(-w, w, t), upper(lerp(-w, w, t))]);
    const bot = sampleT(18, (t) => [lerp(w, -w, t), lower(lerp(w, -w, t))]);
    dr.fill([...top, ...bot].map(([a, b]) => Q(a, b)));
    const rI = h * 0.9;
    const icx = gx * w * 0.42, icy = gy * h * 0.3 - e.lid * h * 0.2;
    const inside = (a, b) => b <= upper(a) - 0.002 && b >= lower(a) + 0.002;
    const irisPts = sampleT(36, (t) => [icx + Math.cos(t * 2 * PI) * rI, icy + Math.sin(t * 2 * PI) * rI]);
    for (const run of runs(irisPts, ([a, b]) => inside(a, b), 2)) dr.stroke(run.map(([a, b]) => Q(a, b)), { weight: 0.75, passes: 1 });
    const pr = rI * 0.52;
    const pupil = sampleT(16, (t) => {
      const a = icx + Math.cos(t * 2 * PI) * pr;
      return [a, clamp(icy + Math.sin(t * 2 * PI) * pr, lower(a), upper(a))];
    });
    dr.fill(pupil.map(([a, b]) => Q(a, b)), { color: "ink", opacity: style.inkOpacity });
    const hl = [icx - pr * 0.45, icy + pr * 0.45];
    if (inside(hl[0], hl[1])) {
      const [hx, hy] = Q(hl[0], hl[1]);
      dr.dot(hx, hy, Math.max(0.7, pr * S * 0.32), { color: "paper" });
    }
    dr.stroke(top.map(([a, b]) => Q(a, b)), { weight: 1.3 });
    const lo = sampleT(12, (t) => {
      const a = side * lerp(-0.45, 0.95, t) * w;
      return Q(a, lower(a));
    });
    dr.stroke(lo, { weight: 0.6, taper: 0.9 });
    if (e.lid > 0.22 || r.chance(0.3)) dr.stroke(sampleT(10, (t) => Q(lerp(-0.75, 0.8, t) * w, upper(lerp(-0.75, 0.8, t) * w) + h * 0.5)), { weight: 0.55, taper: 0.9 });
    if (e.lashes) for (const k of [0.55, 0.72, 0.88]) {
      const a = side * k * w, b = upper(a);
      dr.stroke([Q(a, b), Q(a + side * w * 0.12, b + h * 0.45)], { weight: 0.6, noOvershoot: true, taper: 0.9 });
    }
    if (face.details.wrinkles > 0.5) dr.stroke(sampleT(8, (t) => Q(side * lerp(-0.2, 0.7, t) * w, lower(side * lerp(-0.2, 0.7, t) * w) - h * 0.55)), { weight: 0.45, taper: 1 });
  }

  function drawBrow(side) {
    const e = face.eyes, b = face.brows;
    const u0 = side * (e.u + 0.02);
    const bw = b.w;
    const yb = (a) => {
      const q = a / bw;
      return b.lift - style.droop * 0.03 + b.arch * (1 - q * q) + (b.tilt - style.droop * 0.6) * 0.045 * q * side;
    };
    const S0 = surf(u0, e.v, 0, b.lift, 0.03);
    if (!vis(S0, 0.08)) return;
    const pts = sampleT(14, (t) => {
      const a = lerp(-bw, bw, t);
      return surf(u0, e.v, a, yb(a), 0.03);
    });
    if (b.kind === "block") {
      const th = 0.016 * b.thick;
      const topL = pts.map((s, i) => surf(u0, e.v, lerp(-bw, bw, i / 14), yb(lerp(-bw, bw, i / 14)) + th * (side * lerp(-1, 1, i / 14) < 0 ? 1 : 0.5), 0.03));
      dr.fill([...pts.map(P2), ...topL.reverse().map(P2)], { color: "ink", opacity: style.inkOpacity });
    } else if (b.kind === "hairy") {
      for (let i = 0; i < 9 + b.thick * 5; i++) {
        const t = r.next();
        const a = lerp(-bw, bw, t);
        const y = yb(a) + r.range(-0.012, 0.012);
        dr.stroke([P2(surf(u0, e.v, a, y - 0.01, 0.03)), P2(surf(u0, e.v, a + side * 0.025, y + 0.012, 0.03))], { weight: 0.6, noOvershoot: true, passes: 1 });
      }
    } else curve(pts, { weight: 0.75 + b.thick * 0.6, taper: 0.85 });
  }

  function drawNose() {
    const n = face.nose, e = face.eyes;
    const ns = Math.abs(pose.yaw) > 0.12 ? Math.sign(pose.yaw) : n.side;
    const N = (a, b, c) => surf(0, e.v, a, b, c);
    const w = n.w, tip = -n.len, pj = n.proj;
    if (!vis(N(0, tip, 0), 0.05)) return;
    if (n.kind === "button") {
      curve(sampleT(12, (t) => {
        const a = lerp(-0.6, 0.6, t) * w;
        const q = a / (0.6 * w);
        return N(a, tip - 0.035 * (1 - q * q) + 0.01, pj * 0.6 * (1 - 0.3 * q * q));
      }), { weight: 1 });
      for (const s of [-1, 1]) {
        const p = P2(N(s * w * 0.33, tip - 0.02, pj * 0.35));
        dr.dot(p[0], p[1], Math.max(0.8, st().weight * 0.6));
      }
      return;
    }
    if (n.kind === "wide") {
      for (const s of [-1, 1]) curve([N(s * w * 0.55, tip + 0.06, pj * 0.25), N(s * w * 0.85, tip + 0.01, pj * 0.25), N(s * w * 0.75, tip - 0.035, pj * 0.3), N(s * w * 0.4, tip - 0.04, pj * 0.45)], { weight: 0.95 });
      curve(sampleT(8, (t) => N(lerp(-0.3, 0.3, t) * w, tip - 0.045 + Math.sin(t * PI) * -0.008, pj * 0.6)), { weight: 0.8 });
      curve(sampleT(8, (t) => N(ns * w * 0.3, lerp(-0.08, tip + 0.07, t), pj * t * 0.7)), { weight: 0.7, taper: 1 });
      return;
    }
    const top = n.kind === "long" ? 0.02 : -0.07;
    const hump = n.kind === "long" ? 0.25 : 0;
    const ridge = sampleT(12, (t) => N(ns * w * lerp(0.2, 0.5, t), lerp(top, tip + 0.035, t), pj * Math.pow(t, 1.2) * (1 + hump * Math.sin(t * PI)) * 0.95));
    const hook = [N(ns * w * 0.5, tip + 0.0, pj * 0.85), N(ns * w * 0.25, tip - 0.035, pj * 0.72), N(-ns * w * 0.05, tip - 0.042, pj * 0.6), N(-ns * w * 0.32, tip - 0.03, pj * 0.42)];
    curve([...ridge, ...hook], { weight: 1 });
    curve([N(-ns * w * 0.62, tip + 0.012, pj * 0.28), N(-ns * w * 0.74, tip - 0.018, pj * 0.25), N(-ns * w * 0.55, tip - 0.036, pj * 0.32)], { weight: 0.85 });
  }

  function mouthCurves() {
    const m = face.mouth;
    // open mouths are narrower and rounder ("o" when neutral, wide grin when smiling)
    const w = m.w * (1 + Math.max(0, m.smile) * 0.15) * (m.open > 0.05 ? lerp(0.6, 1, Math.max(0, m.smile)) : 1);
    const k = m.smile * 0.055;
    const up = (a) => {
      const q = a / w;
      return k * (q * q - 0.35) + Math.abs(m.smirk) * 0.04 * Math.pow(Math.max(0, q * Math.sign(m.smirk || 1)), 1.5);
    };
    const lo = (a) => {
      const q = a / w;
      return up(a) - m.open * 0.1 * Math.pow(Math.max(0, 1 - q * q), 0.6) * (1 + 0.4 * Math.max(0, m.smile));
    };
    return { w, up, lo };
  }

  function drawMouth() {
    const m = face.mouth;
    const { w, up, lo } = mouthCurves();
    const M = (a, b) => surf(0, m.v, a, b, 0.015);
    if (!vis(M(0, 0), 0.05)) return;
    const upper = sampleT(20, (t) => lerp(-w, w, t)).map((a) => M(a, up(a)));
    if (m.open > 0.05) {
      const lower = sampleT(20, (t) => lerp(w, -w, t)).map((a) => M(a, lo(a)));
      const poly = [...upper, ...lower].map(P2);
      dr.fill(poly, { color: "ink", opacity: 0.88 * style.inkOpacity });
      if (m.smile > 0.25) {
        const teeth = [...sampleT(12, (t) => lerp(-0.8, 0.8, t) * w).map((a) => M(a, up(a) - 0.002)), ...sampleT(12, (t) => lerp(0.8, -0.8, t) * w).map((a) => M(a, Math.max(lo(a), up(a) - 0.024)))];
        dr.fill(teeth.map(P2));
      }
      curve(upper, { weight: 1.1 });
      curve(lower, { weight: 0.9 });
    } else {
      curve(upper, { weight: 1.15, taper: 0.7 });
    }
    if (m.lip) {
      const yb = Math.min(...sampleT(6, (t) => lo(lerp(-0.3, 0.3, t) * w)));
      curve(sampleT(8, (t) => {
        const a = lerp(-0.32, 0.32, t) * w;
        return M(a, yb - 0.055 - 0.012 * (1 - Math.pow(a / (0.32 * w), 2)));
      }), { weight: 0.6, taper: 0.9 });
    }
    if (m.smile > 0.45) for (const s of [-1, 1]) {
      const a = s * w;
      curve([M(a * 0.96, up(a) + 0.02), M(a * 1.06, up(a) - 0.005), M(a * 1.02, up(a) - 0.025)], { weight: 0.6, noOvershoot: true });
    }
  }

  function drawTear() {
    const e = face.eyes;
    const side = Math.abs(pose.yaw) > 0.2 ? -Math.sign(pose.yaw) : 1;
    const s0 = surf(side * (e.u + e.w * 0.4), e.v, 0, -e.w * e.h - 0.09, 0.02);
    if (!vis(s0, 0.1)) return;
    const [x, y] = P2(s0);
    const R = 3.2;
    const drop = sampleT(20, (t) => {
      const a = t * 2 * PI;
      const rr = R * (1 - 0.55 * Math.max(0, Math.sin(a - PI / 2) * -1) ** 2);
      return [x + Math.cos(a) * R * 0.75 * (1 - Math.max(0, -Math.sin(a)) * 0.9), y + Math.sin(a) * R * (Math.sin(a) < 0 ? 1.7 : 1) + 0 * rr];
    });
    dr.fill(drop);
    dr.stroke(drop, { closed: true, weight: 0.7, noOvershoot: true });
    dr.stroke(sampleT(4, (t) => [x - 1.2 + t * 0.3, y + 0.4 - t * 1.4]), { weight: 0.45, noOvershoot: true });
  }

  function drawDetails() {
    const d = face.details, e = face.eyes, m = face.mouth;
    const dotR = Math.max(0.45, style.weight * 0.32);
    for (let i = 0; i < Math.round(d.freckles); i++) {
      const side = r.sign();
      const s = r.chance(0.2) ? surf(r.range(-0.12, 0.12), e.v, 0, -0.12 - r.range(0, 0.1), 0.1) : surf(side * r.range(0.22, 0.5), e.v, 0, -0.17 - r.range(0, 0.16), 0.01);
      if (vis(s, 0.15)) {
        const [x, y] = P2(s);
        dr.dot(x, y, dotR * r.range(0.6, 1.1), { opacity: 0.8 });
      }
    }
    for (let i = 0; i < d.moles; i++) {
      const s = surf(r.range(-0.6, 0.6), r.range(-0.6, 0.15), 0, 0, 0.01);
      if (vis(s, 0.2)) {
        const [x, y] = P2(s);
        dr.dot(x, y, dotR * 1.5);
      }
    }
    if (d.stubble > 0) {
      const count = Math.round(220 * d.stubble);
      for (let i = 0; i < count; i++) {
        const u = r.range(-1.25, 1.25), v = r.range(-1.45, m.v + 0.14);
        const nearMouth = Math.abs(u) < 0.5 && Math.abs(v - m.v) < 0.075;
        const upperLipZone = v > m.v + 0.04 && Math.abs(u) > 0.34;
        if (nearMouth || upperLipZone) continue;
        const s = surf(u, v, 0, 0, 0.005);
        if (!vis(s, 0.15)) continue;
        const [x, y] = P2(s);
        dr.dot(x, y, 0.35 + 0.15 * r.next(), { opacity: 0.75 });
      }
    }
    if (d.wrinkles > 0.25) {
      for (let k = 0; k < (d.wrinkles > 0.6 ? 3 : 2); k++) {
        const y = e.v + 0.32 + k * 0.075;
        const span = r.range(0.18, 0.32);
        const c0 = r.range(-0.08, 0.08);
        curve(sampleT(10, (t) => surf(lerp(c0 - span, c0 + span, t), y, 0, Math.sin(t * PI) * 0.012, 0.005)), { weight: 0.42, taper: 1, vis: 0.1 });
      }
      for (const side of [-1, 1]) {
        const s = surf(side * (e.u + e.w * 1.1), e.v, 0, 0, 0.005);
        if (!vis(s, 0.1)) continue;
        for (const k of [-0.03, 0, 0.03]) curve([surf(side * (e.u + e.w * 1.15), e.v, 0, k * 0.7, 0.005), surf(side * (e.u + e.w * 1.15 + 0.08), e.v, 0, k * 1.6, 0.005)], { weight: 0.4, taper: 1, noOvershoot: true });
      }
    }
    if (d.wrinkles > 0.45 || face.mouth.smile > 0.65) {
      const mw = face.mouth.w;
      for (const side of [-1, 1]) curve(sampleT(10, (t) => surf(side * lerp(face.nose.w * 0.9, mw * 1.25, t), lerp(e.v, m.v, 0.0), 0, lerp(-face.nose.len + 0.0, (m.v - e.v) * H.ry - 0.05, t) + Math.sin(t * PI) * 0.0, 0.01)), { weight: 0.45, taper: 1, vis: 0.15 });
    }
    if (d.blush) {
      for (const side of [-1, 1]) {
        const s = surf(side * 0.48, e.v, 0, -0.22, 0.01);
        if (!vis(s, 0.2)) continue;
        const [x, y] = P2(s);
        for (let k = 0; k < 4; k++) dr.stroke([[x - 6 + k * 3.4, y + 3], [x - 3 + k * 3.4, y - 3]], { weight: 0.45, noOvershoot: true, passes: 1 });
      }
    }
  }

  // ---------------- hair ----------------
  function hairline(u) {
    const w = (1 - Math.cos(u)) / 2;
    let front = hair.front;
    if (hair.style === "fringe") front = 0.22;
    const v = w < 0.5 ? lerp(front, hair.side, smooth(w * 2)) : lerp(hair.side, hair.back, smooth((w - 0.5) * 2));
    return v + (w < 0.5 ? hair.sweep * Math.sin(u) * 0.07 * (1 - w * 2) : 0);
  }

  function hairVolume() {
    return { buzz: 0.012, short: 0.06, messy: 0.12, curly: 0.13, afro: 0.36, swept: 0.09, long: 0.06, wavy: 0.08, bun: 0.05, fringe: 0.07, bald: 0 }[hair.style] ?? 0.06;
  }

  function capGrid(vol, line = hairline) {
    const NUc = 56, NVc = 12;
    const g = [];
    for (let i = 0; i <= NUc; i++) {
      const u = -PI + (2 * PI * i) / NUc;
      const vh = line(u);
      const row = [];
      for (let j = 0; j <= NVc; j++) {
        const v = vh + ((PI / 2 - 0.02 - vh) * j) / NVc;
        const n = H.normal(u, v);
        const infl = vol * (0.35 + 0.65 * smooth((v - vh) / 0.3)) * (0.75 + 0.25 * Math.sin(v));
        const P = add(H.point(u, v), mul(n, infl));
        row.push({ u, v, P, n, s: V.proj(P) });
      }
      g.push(row);
    }
    const qs = [], front = [];
    for (let i = 0; i < NUc; i++)
      for (let j = 0; j < NVc; j++) {
        const q = [g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]];
        qs.push(q.map((c) => c.s));
        // front-facing = drawn counter-/clockwise the same way as the face itself
        if (polyArea(q.map((c) => c.s)) * frontSign > 0 && q.some((c) => V.facing(c.n) > -0.3)) front.push(q.map((c) => c.s));
      }
    // hair = what you see of the cap: the front-facing part, plus whatever
    // sticks out beyond the head's silhouette (the back half is hidden by the face)
    const opts = { erase: [headPoly], after: front };
    return { g, qs, opts };
  }

  function capPoint(u, v, vol, k = 0.8) {
    const vh = hairline(u);
    const n = H.normal(u, v);
    const infl = vol * k * (0.35 + 0.65 * smooth((v - vh) / 0.3)) * (0.75 + 0.25 * Math.sin(v));
    return { P: add(H.point(u, v), mul(n, infl)), N: n };
  }

  function drawHairCap() {
    const vol = hairVolume();
    if (hair.style === "bun") drawBun(vol);
    const { qs, opts } = capGrid(vol);
    let polys = contoursOf(qs, { minArea: 40, ...opts });
    if (!polys.length) return;
    const biggest = Math.abs(polyArea(polys[0]));
    polys = polys.filter((p) => Math.abs(polyArea(p)) > biggest * 0.12);
    const outline = { short: "spiky", messy: "spiky", curly: "scallop", afro: "scallop", wavy: "wave" }[hair.style] ?? "smooth";
    const size = { short: 0.6, messy: 1.3, curly: 0.9, afro: 1.5, wavy: 0.8 }[hair.style] ?? 1;
    for (const poly of polys) {
      const shape = hair.style === "buzz" ? poly : decorate(poly, outline, size);
      if (hair.fill === "solid" && hair.style !== "buzz") {
        dr.fill(shape, { color: "ink", opacity: 0.93 * style.inkOpacity });
      } else {
        dr.fill(shape);
        if (hair.fill === "hatch" && hair.style !== "buzz") dr.hatch(shape, { spacing: 0.75, angle: style.hatchAngle + hair.sweep * 0.5, weight: 0.45, style: style.hatchStyle === "stipple" ? "stipple" : "parallel" });
      }
      if (hair.style === "buzz") {
        const segs = resample(shape, 4, true);
        for (let i = 0; i < segs.length; i += 1) dr.dot(segs[i][0], segs[i][1], 0.5, { opacity: 0.7 });
      } else dr.stroke(shape, { closed: true, weight: 1.1, breaks: style.lineBreaks });
    }
    hairTexture(vol, polys[0]);
  }

  function hairTexture(vol, poly) {
    const solid = hair.fill === "solid";
    const col = solid ? "paper" : "ink";
    const amount = 0.5 + style.detail;
    const st0 = hair.style;
    if (st0 === "buzz") {
      for (let i = 0; i < 260; i++) {
        const u = r.range(-PI, PI), v = r.range(hairline(u) + 0.02, PI / 2 - 0.05);
        const s = capPoint(u, v, vol);
        if (!vis(s, 0.1)) continue;
        const [x, y] = P2(s);
        dr.dot(x, y, 0.4, { opacity: 0.6 });
      }
      return;
    }
    if (st0 === "curly" || st0 === "afro") {
      const count = Math.round((st0 === "afro" ? 45 : 30) * amount);
      for (let i = 0; i < count; i++) {
        const u = r.range(-PI, PI), v = r.range(hairline(u) + 0.05, PI / 2 - 0.1);
        const s = capPoint(u, v, vol, 0.85);
        if (!vis(s, 0.15)) continue;
        const [x, y] = P2(s);
        if (!pointInPoly([x, y], poly)) continue;
        const rad = r.range(1.8, 3.6) * (st0 === "afro" ? 1.2 : 1);
        const ph = r.range(0, 2 * PI);
        dr.stroke(sampleT(14, (t) => [x + Math.cos(ph + t * 2.4 * PI) * rad * (1 - t * 0.35), y + Math.sin(ph + t * 2.4 * PI) * rad * (1 - t * 0.35)]), { weight: 0.55, color: col, noOvershoot: true, passes: 1 });
      }
      return;
    }
    // strands that flow from the crown towards the hairline
    const count = Math.round((st0 === "messy" ? 22 : 16) * amount);
    for (let i = 0; i < count; i++) {
      const u = r.range(-PI * 0.75, PI * 0.75);
      const v0 = r.range(0.75, PI / 2 - 0.08);
      const len = r.range(0.4, 0.95);
      const drift = (st0 === "swept" ? hair.sweep * 0.5 : r.range(-0.2, 0.2)) * len;
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const uu = u + drift * t;
        const v = v0 - len * t;
        if (v < hairline(uu) + 0.04) break;
        pts.push(capPoint(uu, v, vol, 0.75));
      }
      for (const run of runs(pts, (s) => vis(s, 0.12), 3)) dr.stroke(run.map(P2), { weight: 0.5, color: col, taper: 1, passes: 1 });
    }
    if (st0 === "swept" || (st0 === "long" && Math.abs(hair.sweep) > 0.3)) {
      const pu = hair.sweep * 0.35;
      curve(sampleT(10, (t) => capPoint(pu + t * 0.05, lerp(hairline(pu) + 0.02, 1.25, t), vol, 0.9)), { weight: 0.7, color: col, vis: 0.1 });
    }
  }

  function decorate(poly, mode, size) {
    if (mode === "smooth") return poly;
    const n = poly.length;
    let flip = 1;
    {
      const a = poly[0], b = poly[1 % n];
      const t = [b[0] - a[0], b[1] - a[1]];
      const l = Math.hypot(t[0], t[1]) || 1;
      const test = [a[0] + (t[1] / l) * 2, a[1] - (t[0] / l) * 2];
      if (pointInPoly(test, poly)) flip = -1;
    }
    const nrm = (i) => {
      const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
      const t = [b[0] - a[0], b[1] - a[1]];
      const l = Math.hypot(t[0], t[1]) || 1;
      return [(t[1] / l) * flip, (-t[0] / l) * flip];
    };
    const out = [];
    let i = 0;
    while (i < n) {
      const chunk = Math.max(2, Math.round((mode === "spiky" ? r.range(3, 5.5) : mode === "wave" ? r.range(6, 9) : r.range(3.5, 6.5)) * size));
      const j = Math.min(n, i + chunk);
      const A = poly[i], B = poly[j % n];
      const N = nrm(Math.floor((i + j) / 2) % n);
      const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const d = dist(A, B);
      if (mode === "spiky") {
        const h = r.range(2.5, 7) * size;
        const sk = hair.sweep * 3 * size;
        out.push(A, [M[0] + N[0] * h + (B[0] - A[0]) * 0.15 + sk * 0.3, M[1] + N[1] * h + (B[1] - A[1]) * 0.15]);
      } else {
        const h = d * (mode === "wave" ? 0.25 : r.range(0.35, 0.55));
        const C = [M[0] + N[0] * h * 1.6, M[1] + N[1] * h * 1.6];
        for (let k = 0; k < 6; k++) {
          const t = k / 6;
          out.push([(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]]);
        }
      }
      i = j;
    }
    return out;
  }

  function drawBun(vol) {
    const c = V.proj(add(H.point(PI * 0.92, 1.05), [0, 0.3, 0]));
    const rad = 0.3 * S;
    const ring = sampleT(30, (t) => [c[0] + Math.cos(t * 2 * PI) * rad, c[1] + Math.sin(t * 2 * PI) * rad * 0.9]);
    if (hair.fill === "solid") dr.fill(ring, { color: "ink", opacity: 0.93 * style.inkOpacity });
    else dr.fill(ring);
    dr.stroke(ring, { closed: true, weight: 1.1 });
    dr.stroke(sampleT(30, (t) => [c[0] + Math.cos(t * 4 * PI) * rad * (0.75 - t * 0.6), c[1] + Math.sin(t * 4 * PI) * rad * 0.7 * (0.75 - t * 0.6)]), { weight: 0.5, color: hair.fill === "solid" ? "paper" : "ink", passes: 1 });
  }

  function drawCurtain() {
    const vol = hairVolume() + 0.04;
    const bob = hair.style === "fringe";
    const yBot = bob ? -0.85 : -hair.length;
    const flare = bob ? 0.12 : 0.35;
    const wavy = hair.style === "wavy";
    const NUc = 40, NT = 16;
    const yTop = 0.55;
    const pt = (u, t) => {
      const y = lerp(yTop, yBot, t);
      const skull = y > 0 ? Math.sqrt(Math.max(0, 1 - (y / H.ry) ** 2)) : 1; // hug the head above eye level
      const below = Math.max(0, -y) / Math.max(0.1, -yBot); // 0 at eye level -> 1 at the ends
      let x = (H.rx + vol) * Math.sin(u) * skull * (1 + flare * below);
      const z = (H.rz + vol) * Math.cos(u) * skull * (1 + 0.3 * flare * below);
      if (wavy) x += Math.sin(t * 10 + u * 2) * 0.05 * t;
      return V.proj([x, y, z]);
    };
    const qs = [];
    for (let i = 0; i < NUc; i++)
      for (let k = 0; k < NT; k++) {
        const u0 = lerp(0.95, 2 * PI - 0.95, i / NUc), u1 = lerp(0.95, 2 * PI - 0.95, (i + 1) / NUc);
        qs.push([pt(u0, k / NT), pt(u1, k / NT), pt(u1, (k + 1) / NT), pt(u0, (k + 1) / NT)]);
      }
    const poly = contoursOf(qs)[0];
    if (!poly) return;
    const shape = wavy ? decorate(poly, "wave", 1.2) : poly;
    if (hair.fill === "solid") dr.fill(shape, { color: "ink", opacity: 0.93 * style.inkOpacity });
    else {
      dr.fill(shape);
      if (hair.fill === "hatch") dr.hatch(shape, { spacing: 0.8, angle: PI / 2 + 0.15, weight: 0.42, style: "parallel" });
    }
    dr.stroke(shape, { closed: true, weight: 1.1, breaks: style.lineBreaks + 1 });
    const col = hair.fill === "solid" ? "paper" : "ink";
    for (let k = 0; k < 10; k++) {
      const s = r.sign();
      const u = s * r.range(1.0, 1.9);
      const t0 = r.range(0.05, 0.4), t1 = r.range(0.6, 0.98);
      dr.stroke(sampleT(10, (t) => pt(u + Math.sin(t * 3) * 0.05, lerp(t0, t1, t))), { weight: 0.5, color: col, taper: 1, passes: 1 });
    }
  }

  function drawBeanie() {
    const line = (u) => {
      const w = (1 - Math.cos(u)) / 2;
      return lerp(0.5, 0.15, w);
    };
    const vol = 0.1;
    const { qs, opts } = capGrid(vol, line);
    const poly = contoursOf(qs, opts)[0];
    if (!poly) return;
    if (r.chance(0.5)) {
      const top = V.proj(add(H.point(0, PI / 2 - 0.05), [0, 0.12 + vol, 0]));
      const ring = sampleT(18, (t) => [top[0] + Math.cos(t * 2 * PI) * 9, top[1] - 6 + Math.sin(t * 2 * PI) * 8]);
      dr.fill(ring);
      dr.stroke(decorate(ring, "scallop", 0.5), { closed: true, weight: 0.9 });
    }
    if (style.fillBlacks > 0.5) dr.fill(poly, { color: "ink", opacity: 0.9 });
    else dr.fill(poly);
    dr.stroke(poly, { closed: true, weight: 1.15, breaks: style.lineBreaks });
    const col = style.fillBlacks > 0.5 ? "paper" : "ink";
    const brim = sampleT(30, (t) => {
      const u = lerp(-PI, PI, t);
      return capPoint2(u, line(u) + 0.2);
    });
    curve(brim, { weight: 0.9, color: col, vis: 0.05 });
    for (let k = -8; k <= 8; k++) {
      const u = k * 0.17;
      curve([capPoint2(u, line(u) + 0.03), capPoint2(u, line(u) + 0.18)], { weight: 0.45, color: col, vis: 0.15, noOvershoot: true });
    }
    function capPoint2(u, v) {
      const n = H.normal(u, v);
      return { P: add(H.point(u, v), mul(n, vol * 1.02)), N: n };
    }
  }

  function drawGlasses(kind) {
    const e = face.eyes;
    const R = e.w * 1.5;
    const c = 0.11;
    const lens = (side, t) => {
      const a = Math.cos(t * 2 * PI), b = Math.sin(t * 2 * PI);
      if (kind === "round") return surf(side * e.u, e.v, a * R, b * R * 0.92, c);
      const sq = (x) => Math.sign(x) * Math.pow(Math.abs(x), 0.45);
      return surf(side * e.u, e.v, sq(a) * R * 1.05, sq(b) * R * 0.72 - (b < 0 ? R * 0.05 : 0), c);
    };
    for (const side of [-1, 1]) {
      const pts = sampleT(36, (t) => lens(side, t));
      if (!vis(pts[0], -0.05) && !vis(pts[18], -0.05)) continue;
      const poly = pts.map(P2);
      if (kind === "sun") {
        if (style.fillBlacks > 0.35) dr.fill(poly, { color: "ink", opacity: 0.92 * style.inkOpacity });
        else {
          dr.fill(poly);
          dr.hatch(poly, { spacing: 0.55, weight: 0.5, style: "parallel" });
        }
        const a = surf(side * e.u, e.v, -R * 0.5, R * 0.1, c), b = surf(side * e.u, e.v, -R * 0.1, R * 0.5, c);
        dr.stroke([P2(a), P2(b)], { weight: 1, color: "paper", noOvershoot: true, passes: 1 });
      }
      curve(pts, { weight: kind === "sun" ? 1.3 : 1.05, vis: -0.1 });
      curve(sampleT(10, (t) => surf(side * lerp(e.u + R / H.rx, PI / 2 - 0.3, t), e.v, 0, R * 0.25, lerp(c, 0.03, t))), { weight: 0.8, vis: 0.02 });
    }
    curve(sampleT(8, (t) => surf(lerp(-e.u + R / H.rx, e.u - R / H.rx, t) * 0.98, e.v, 0, R * 0.2 + Math.sin(t * PI) * 0.03, c + 0.01)), { weight: 0.9, vis: -0.1 });
  }

  function drawHeadphones() {
    const v = hairVolume() + 0.1;
    const band = (off) => sampleT(30, (t) => {
      const th = lerp(0.05, PI - 0.05, t);
      return { P: [Math.cos(th) * (H.rx + v + off), Math.sin(th) * (H.ry + v * 0.7 + off) * 0.98 - 0.08, -0.05], N: [Math.cos(th), Math.sin(th), 0.3] };
    });
    for (const off of [0, 0.06]) {
      const pts = band(off).map((s) => V.proj(s.P));
      dr.stroke(pts, { weight: 1 });
    }
    for (const side of [-1, 1]) {
      const cpt = [side * (H.rx + 0.08), face.ears.v, -0.05];
      const ring = sampleT(24, (t) => V.proj(add(cpt, [side * 0.06 * Math.cos(t * 2 * PI), Math.sin(t * 2 * PI) * 0.26, Math.cos(t * 2 * PI) * 0.18])));
      if (style.fillBlacks > 0.4) dr.fill(ring, { color: "ink", opacity: 0.9 });
      else dr.fill(ring);
      dr.stroke(ring, { closed: true, weight: 1.1 });
    }
  }

  function st() {
    return style;
  }
}

function avg(vs) {
  const s = [0, 0, 0];
  for (const v of vs) {
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
  }
  return norm(s);
}
