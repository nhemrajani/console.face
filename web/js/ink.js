// Hand-drawn ink. Every mark is turned into a filled "ribbon" whose width
// changes like pen pressure, wobbles like a real hand, overshoots its ends,
// and is sometimes traced twice. The artist's style controls all of it.
//
// A Drawing collects marks in the order they were drawn. That order is kept
// so Milestone 3 can replay it as a live sketch.

import { makeRng, noise1 } from "./rng.js";
import { resample, polyLength, dist, scanPolygon, pointInPoly, bbox, clamp } from "./geom.js";

const f1 = (x) => Math.round(x * 10) / 10;

export class Drawing {
  constructor(style, seed) {
    this.style = style;
    this.rng = makeRng("ink:" + seed);
    this.items = []; // {d, fill, opacity, group}
    this.group = "misc";
  }

  setGroup(name) {
    this.group = name;
  }

  // A line through 2D screen points.
  stroke(pts, o = {}) {
    const st = this.style;
    const r = this.rng;
    if (!pts || pts.length < 2) return;
    const closed = !!o.closed;
    let base = resample(pts, 2, closed);
    if (base.length < 2) return;
    const total = polyLength(base, closed);
    if (total < 1.2) return;

    // long outlines: the artist lifts the pen a few times
    const breaks = o.breaks ? Math.max(1, Math.min(o.breaks, Math.floor(total / 60))) : 1;
    let pieces = [];
    if (closed) {
      const k = Math.floor(r.next() * base.length);
      base = base.slice(k).concat(base.slice(0, k));
      const overlap = Math.max(2, Math.floor(base.length * r.range(0.03, 0.09)));
      if (breaks <= 1) pieces = [base.concat(base.slice(0, overlap))];
      else {
        const n = base.length;
        for (let b = 0; b < breaks; b++) {
          const s = Math.floor((n * b) / breaks);
          const e = Math.floor((n * (b + 1)) / breaks) + Math.floor(r.range(1, 4));
          const seg = [];
          for (let i = s; i <= e; i++) seg.push(base[i % n]);
          pieces.push(seg);
        }
      }
    } else if (breaks > 1) {
      const n = base.length;
      for (let b = 0; b < breaks; b++) {
        const s = Math.max(0, Math.floor((n * b) / breaks) - (b ? 2 : 0));
        const e = Math.min(n - 1, Math.floor((n * (b + 1)) / breaks));
        pieces.push(base.slice(s, e + 1));
      }
    } else pieces = [base];

    const passes = o.passes ?? (total > 25 ? st.passes : 1);
    for (const piece of pieces) {
      for (let pass = 0; pass < passes; pass++) this._ribbon(piece, o, pass, !closed || breaks > 1);
    }
  }

  _ribbon(pts, o, pass, ends) {
    const st = this.style;
    const r = this.rng;
    let p = pts;
    const wMul = o.weight ?? 1;
    // overshoot past the ends
    if (ends && !o.noOvershoot && p.length > 3) {
      const os = Math.min(st.overshoot * (o.overshoot ?? 1) * r.range(0.2, 1), polyLength(p) * 0.25);
      if (os > 0.6) {
        const a = p[0], b = p[1], y = p[p.length - 1], z = p[p.length - 2];
        const da = dist(a, b) || 1, dz = dist(y, z) || 1;
        const head = [a[0] + ((a[0] - b[0]) / da) * os * r.range(0, 0.6), a[1] + ((a[1] - b[1]) / da) * os * r.range(0, 0.6)];
        const tail = [y[0] + ((y[0] - z[0]) / dz) * os, y[1] + ((y[1] - z[1]) / dz) * os];
        p = [head, ...p, tail];
        p = resample(p, 2);
      }
    }
    const n = p.length;
    if (n < 2) return;
    const nLow = noise1(r.int(0, 1e9)), nHigh = noise1(r.int(0, 1e9)), nW = noise1(r.int(0, 1e9));
    const wob = st.wobble * (o.wobble ?? 1);
    const jit = st.jitter * (o.jitter ?? 1);
    const off = pass ? [r.range(-1, 1) * st.passSpread, r.range(-1, 1) * st.passSpread] : [0, 0];
    const baseW = Math.max(0.35, st.weight * wMul * (pass ? 0.55 : 1));
    const taper = o.taper ?? st.taper;

    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + dist(p[i - 1], p[i]));
    const L = s[n - 1] || 1;
    const left = [], right = [];
    const ph = r.range(0, 100);
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty, ny = tx;
      const disp = wob * nLow(ph + s[i] / 45) + jit * nHigh(ph + s[i] / 4);
      const t = s[i] / L;
      const endF = clamp(Math.min(t, 1 - t) / Math.min(0.5, 10 / L));
      const tw = 1 - taper + taper * Math.pow(endF, 0.6);
      const w = Math.max(0.22, baseW * (1 + st.pressureVar * nW(ph + s[i] / 25)) * tw) / 2;
      const cx = p[i][0] + nx * disp + off[0], cy = p[i][1] + ny * disp + off[1];
      left.push([cx + nx * w, cy + ny * w]);
      right.push([cx - nx * w, cy - ny * w]);
    }
    let d = `M${f1(left[0][0])} ${f1(left[0][1])}`;
    for (let i = 1; i < n; i++) d += `L${f1(left[i][0])} ${f1(left[i][1])}`;
    for (let i = n - 1; i >= 0; i--) d += `L${f1(right[i][0])} ${f1(right[i][1])}`;
    d += "Z";
    const op = (o.opacity ?? 1) * st.inkOpacity * (pass ? 0.6 : 1);
    this.items.push({ d, fill: o.color ?? "ink", opacity: op, group: this.group });
  }

  // Filled shape (paper-white to hide what's behind, or solid ink).
  fill(poly, o = {}) {
    if (!poly || poly.length < 3) return;
    let d = `M${f1(poly[0][0])} ${f1(poly[0][1])}`;
    for (let i = 1; i < poly.length; i++) d += `L${f1(poly[i][0])} ${f1(poly[i][1])}`;
    d += "Z";
    this.items.push({ d, fill: o.color ?? "paper", opacity: o.opacity ?? 1, group: this.group });
  }

  // A small blobby dot (pupils, freckles).
  dot(x, y, rad, o = {}) {
    const r = this.rng;
    const pts = [];
    const k = Math.max(6, Math.round(rad * 3));
    const ph = r.range(0, 6.28);
    const sq = r.range(0.85, 1.1);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2;
      const rr = rad * (1 + 0.12 * Math.sin(a * 2 + ph) + r.range(-0.05, 0.05));
      pts.push([x + Math.cos(a) * rr * sq, y + Math.sin(a) * rr]);
    }
    this.fill(pts, { color: o.color ?? "ink", opacity: (o.opacity ?? 1) * (o.color === "paper" ? 1 : this.style.inkOpacity) });
  }

  // Shading inside a polygon in the artist's hatching style.
  hatch(poly, o = {}) {
    const st = this.style;
    const r = this.rng;
    if (!poly || poly.length < 3) return;
    const sp = st.hatchSpacing * (o.spacing ?? 1) * r.range(0.9, 1.1);
    const ang = (o.angle ?? st.hatchAngle) + r.range(-0.08, 0.08);
    const style = o.style ?? st.hatchStyle;
    const hw = o.weight ?? 0.45;
    const lineOpts = { weight: hw, wobble: 0.3, jitter: 0.5, passes: 1, taper: 0.6, overshoot: 0.3, opacity: o.opacity ?? 0.9 };

    if (style === "stipple") {
      const bb = bbox(poly);
      const area = (bb.x1 - bb.x0) * (bb.y1 - bb.y0);
      const count = Math.min(500, Math.round((area / (sp * sp)) * 1.6 * (o.density ?? 1)));
      for (let i = 0; i < count; i++) {
        const pt = [r.range(bb.x0, bb.x1), r.range(bb.y0, bb.y1)];
        if (pointInPoly(pt, poly)) this.dot(pt[0], pt[1], r.range(0.35, 0.7) * Math.max(0.8, st.weight * 0.5));
      }
      return;
    }
    const segs = scanPolygon(poly, ang, sp, r.range(0, sp));
    const trim = (s) => {
      const L = dist(s[0], s[1]);
      if (L < 2.5) return null;
      const t0 = r.range(0, 0.25) * Math.min(1, sp / L), t1 = 1 - r.range(0, 0.25) * Math.min(1, sp / L);
      const at = (t) => [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t];
      return [at(t0), at(t1)];
    };
    if (style === "scribble") {
      // one continuous zig-zag, like shading without lifting the pen
      const pts = [];
      segs.forEach((s, i) => {
        const t = trim(s);
        if (!t) return;
        if (i % 2) pts.push(t[1], t[0]);
        else pts.push(t[0], t[1]);
      });
      if (pts.length > 3) this.stroke(pts, { ...lineOpts, overshoot: 0, noOvershoot: true });
    } else {
      for (const s of segs) {
        const t = trim(s);
        if (t) this.stroke(t, { ...lineOpts, weight: style === "bold parallel" ? hw * 1.6 : hw });
      }
      if (style === "cross-hatch" && (o.cross ?? true)) {
        for (const s of scanPolygon(poly, ang + Math.PI / 2.3, sp * 1.3, r.range(0, sp))) {
          const t = trim(s);
          if (t) this.stroke(t, lineOpts);
        }
      }
    }
  }

  toSVG({ width, height, x = 0, y = 0, paper = "#ffffff", grain = false, title = "" } = {}) {
    const ink = this.style.ink;
    const body = this.items
      .map((it) => `<path d="${it.d}" fill="${it.fill === "ink" ? ink : it.fill === "paper" ? paper : it.fill}"${it.opacity < 1 ? ` fill-opacity="${f1(it.opacity * 100) / 100}"` : ""}/>`)
      .join("");
    const grainDef = grain
      ? `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25"/></filter>`
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${title ? `<title>${title}</title>` : ""}${grainDef}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${paper}"/>${grain ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" filter="url(#grain)" opacity="0.05"/>` : ""}${body}</svg>`;
  }
}
