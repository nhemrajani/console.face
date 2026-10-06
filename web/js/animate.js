// Replays a Drawing stroke by stroke, as if someone is sketching it live.
//
// The song sets the rhythm:
//   - every new part of the face (outline, eyes, nose, hair…) starts on a beat
//   - tempo sets pen speed: slow songs draw long unhurried lines,
//     fast songs draw in quick scribbly bursts
//   - energy shortens the pauses when the pen lifts
//   - shading is dashed off faster than outlines; the print colour lands last

import { clamp, lerp } from "./geom.js";
import { makeRng } from "./rng.js";

const NS = "http://www.w3.org/2000/svg";
const f1 = (x) => Math.round(x * 10) / 10;

// The order an artist actually draws in. (The page still stacks the marks
// in the right layers; this only decides *when* each one appears.)
const SKETCH_ORDER = ["construction", "head", "ears", "eyes", "brows", "nose", "mouth", "neck", "body", "hair", "hair-back", "details", "accessories", "shading", "colour", "mess"];
// within a part: hide what's behind first, then outlines, then solid fills, then shading
const PHASE = (it) => (it.kind === "fill" && it.fill === "paper" ? 0 : it.kind === "stroke" || it.kind === "dot" ? 1 : it.kind === "fill" ? 2 : 3);

// Work out when every mark starts and how long it takes. Times in seconds.
// `timing` is the song being drawn ({ tempo, energy }); defaults to the artist's taste.
export function buildTimeline(drawing, style, timing = style.taste) {
  const taste = timing;
  const t = clamp((taste.tempo - 60) / 120);
  const E = clamp(taste.energy);
  const beat = 60 / taste.tempo;
  const unit = E > 0.6 ? beat / 2 : beat; // energetic songs: start on half-beats too
  let lift = lerp(0.14, 0.02, t) * lerp(1.2, 0.6, E); // pause when the pen lifts
  const r = makeRng("timeline:" + taste.tempo + ":" + drawing.items.length);

  const order = drawing.items
    .map((it, i) => ({ it, i, g: Math.max(0, SKETCH_ORDER.indexOf(it.group)), p: PHASE(it) }))
    .sort((a, b) => a.g - b.g || a.p - b.p || a.i - b.i);

  // pen speed is chosen so the whole drawing fits the song's pace:
  // slow songs take ~20s, fast songs ~9s
  const target = lerp(20, 9, t);
  const inkLen = order.reduce((s, { it }) => s + (it.kind === "hatch" ? it.len / 2.6 : it.kind === "stroke" ? it.len : 0), 0);
  const penSpeed = inkLen / (target * 0.6);
  // pen-lift pauses share a fixed slice of the time, however many strokes there are
  const strokes = order.filter(({ it }) => it.kind === "stroke").length || 1;
  lift = Math.min(lift, (target * 0.2) / strokes);

  const events = new Array(drawing.items.length);
  let now = 0;
  let group = null;
  for (const { it, i } of order) {
    if (it.group !== group) {
      now = Math.ceil(now / unit - 1e-6) * unit; // each part starts on a beat
      group = it.group;
    }
    if (it.kind === "dot") {
      // dots are quick taps of the pen
      events[i] = { it, start: now, dur: 0.06 };
      now += 0.012;
      continue;
    }
    if (it.kind === "fill") {
      const dur = it.fill === "paper" ? 0.001 : it.fill === "accent" ? 0.6 : 0.5;
      events[i] = { it, start: now, dur };
      now += it.fill === "accent" ? beat * 0.5 : it.fill === "paper" ? 0 : 0.15;
      continue;
    }
    // fast songs: speed swings stroke to stroke (scribbly bursts); slow songs stay steady
    const burst = lerp(1, r.range(0.45, 2.1), t);
    const speed = penSpeed * burst * (it.kind === "hatch" ? 2.6 : 1);
    const dur = clamp(it.len / speed, 0.025, 3);
    events[i] = { it, start: now, dur };
    now += dur + (it.kind === "hatch" ? lift * 0.3 : lift);
  }
  return { events, duration: now + 0.3, beat };
}

// Draw `drawing` into `svg` over time. Returns { stop, duration }.
export function animateDrawing(svg, drawing, style, { width, height, speed = 1, timing, onBeat, onDone } = {}) {
  const { events, duration, beat } = buildTimeline(drawing, style, timing);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = "";
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("width", width);
  bg.setAttribute("height", height);
  bg.setAttribute("fill", "#ffffff");
  svg.appendChild(bg);

  const els = events.map(({ it }) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("fill", drawing.colorOf(it));
    if (it.opacity < 1) p.setAttribute("fill-opacity", it.opacity);
    if (it.fill === "accent") p.style.mixBlendMode = "multiply";
    svg.appendChild(p);
    return p;
  });
  // the pen tip that travels along the active stroke
  const pen = document.createElementNS(NS, "circle");
  pen.setAttribute("r", Math.max(1.6, style.weight * 0.9));
  pen.setAttribute("fill", style.ink);
  pen.setAttribute("opacity", "0");
  svg.appendChild(pen);

  const done = new Uint8Array(events.length);
  let first = 0; // events before this index are finished
  let raf = 0;
  let lastBeat = -1;
  const t0 = performance.now();

  function frame() {
    const now = ((performance.now() - t0) / 1000) * speed;
    const b = Math.floor(now / beat);
    if (b !== lastBeat && now < duration) {
      lastBeat = b;
      onBeat?.(b);
    }
    let penAt = null;
    for (let i = first; i < events.length; i++) {
      const ev = events[i];
      if (done[i] || ev.start > now) continue;
      const k = clamp((now - ev.start) / ev.dur);
      const el = els[i];
      const it = ev.it;
      if (it.kind === "fill" || it.kind === "dot") {
        if (!el.getAttribute("d")) el.setAttribute("d", it.d);
        el.setAttribute("fill-opacity", (it.opacity ?? 1) * k);
      } else {
        const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65; // a little ease in and out
        el.setAttribute("d", partial(it, e));
        if (k < 1) penAt = it.left[Math.min(it.left.length - 1, Math.floor(e * (it.left.length - 1)))];
      }
      if (k >= 1) {
        done[i] = 1;
        el.setAttribute("d", it.d);
      }
    }
    while (first < events.length && done[first]) first++;
    if (penAt) {
      pen.setAttribute("cx", penAt[0]);
      pen.setAttribute("cy", penAt[1]);
      pen.setAttribute("opacity", "0.55");
    } else pen.setAttribute("opacity", "0");
    if (first < events.length) raf = requestAnimationFrame(frame);
    else onDone?.();
  }
  raf = requestAnimationFrame(frame);
  return {
    duration: duration / speed,
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}

// The first `k` (0..1) of a ribbon stroke.
function partial(it, k) {
  const n = it.left.length;
  const m = Math.max(1, Math.floor(k * (n - 1)));
  let d = `M${f1(it.left[0][0])} ${f1(it.left[0][1])}`;
  for (let i = 1; i <= m; i++) d += `L${f1(it.left[i][0])} ${f1(it.left[i][1])}`;
  for (let i = m; i >= 0; i--) d += `L${f1(it.right[i][0])} ${f1(it.right[i][1])}`;
  return d + "Z";
}
