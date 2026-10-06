// =====================================================================
//  THE ARTIST: music taste -> drawing style
// =====================================================================
// A "taste" summarises a set of songs (your favourites, or a playlist).
// This file turns it into an artist's habits. Every face drawn with the
// same taste shares these habits, so a sheet looks like one sketchbook.
//
// Taste fields (all 0..1 except tempo):
//   tempo         average BPM (the "felt" tempo, i.e. half-time for most rap)
//   energy        loud / intense vs. quiet / gentle
//   valence       mood: happy / bright vs. sad / dark
//   acousticness  acoustic instruments vs. electronic production
//   danceability  groove / bounce
//   speechiness   rap / spoken words (0.33+ is very rap-heavy)
//   variety       how different the songs are from each other
//
// The big dials (each 0..1) that make artists feel different:
//   mess     loose, re-traced, misaligned, unfinished lines
//   cartoon  realistic proportions -> big-headed, big-eyed cartoon
//   distort  normal face -> Picasso-style dislocated features
//   colour   black ink only -> a second, offset print colour
// =====================================================================

import { clamp, lerp } from "./geom.js";

export function deriveStyle(taste) {
  const t = clamp((taste.tempo - 60) / 120); // 60 BPM -> 0, 180 BPM -> 1
  const E = clamp(taste.energy);
  const V = clamp(taste.valence);
  const A = clamp(taste.acousticness);
  const D = clamp(taste.danceability);
  const S = clamp(taste.speechiness / 0.35); // rap-ness
  const VR = clamp(taste.variety ?? 0.4);

  const s = { taste };

  // ---------- the big dials ----------
  // acoustic, fast and varied music -> messy; rap -> tight and graphic
  s.mess = clamp(0.25 + 0.45 * A + 0.35 * t + 0.3 * VR - 0.4 * S);
  // danceable AND happy -> cartoon; fast + loud adds bounce; sad acoustic -> realistic
  s.cartoon = clamp(0.02 + 1.15 * D * V + 0.4 * t * E - 0.4 * A * (1 - V));
  // loud and all-over-the-place music -> features slip out of place
  s.distort = clamp(1.5 * E * VR + 0.4 * (1 - V) * VR + 0.25 * t - 0.2);
  // energy and variety bring in a second colour; quiet acoustic stays monochrome
  s.colour = clamp(0.1 + 0.65 * E + 0.3 * VR - 0.35 * A * (1 - E));

  // ---------- the pen ----------
  s.weight = 0.5 + 2.8 * E + 1.6 * S; // line thickness in px
  s.pressureVar = clamp(0.1 + 0.55 * A + 0.2 * D * (1 - S), 0, 0.8); // thick/thin like a brush
  s.taper = clamp(0.25 + 0.6 * A - 0.3 * S + 0.2 * (1 - E));
  s.jitter = 0.05 + 3.6 * t * (0.35 + 0.65 * E); // fast tempo -> shaky, scratchy hand
  s.wobble = 0.3 + 3.0 * A * (1 - S) + 1.2 * (1 - V) * (1 - E); // slow drift of the line
  s.overshoot = 2 + 11 * s.mess;
  s.passes = 1 + Math.round(s.mess * 2.2); // lines traced again, slightly off
  s.passSpread = 0.6 + 2.6 * s.mess + 1.5 * t;
  s.lineBreaks = 1 + Math.round(3 * s.mess); // pen lifts on long outlines
  s.gaps = s.mess * 0.22; // chance a piece of an outline is left out
  s.misreg = s.mess * 7; // px each feature slips from where it should be
  s.construction = clamp(s.mess * 1.2 - 0.2 + A * 0.3); // guide lines left visible
  s.connect = clamp((1 - E) * (1 - S) * (1 - t) * 2.4 - 0.35); // smooth music -> pen never lifts
  s.splatter = clamp(E * t * 1.7 - 0.25 + S * 0.25); // ink flicks and blots

  const pencil = A > 0.55 && E < 0.45;
  s.inkOpacity = pencil ? 0.82 : 0.96;

  // ---------- ink colours ----------
  // mood picks the hue: sad = blue -> purple -> pink -> happy = red
  // energy makes it more saturated; acoustic pulls to sepia; rap pulls to black
  const hue = lerp(225, 368, V) % 360;
  let ink = hsl(hue, 18 + 62 * E, 13 + 15 * E);
  ink = mixHex(ink, "#4a2c18", A * 0.75 * (1 - E)); // sepia
  ink = mixHex(ink, pencil ? "#3a3a3a" : "#121212", clamp(S * 1.1)); // black
  s.ink = ink;
  const acc = pickAccent(V, E, A, S);
  s.accent = acc.hex;
  s.accentName = acc.name;

  s.pen = pencil ? "soft pencil" : E > 0.72 || S > 0.65 ? "fat marker" : s.pressureVar > 0.45 ? "brush pen" : t > 0.6 ? "scratchy ballpoint" : "fineliner";

  // ---------- shading ----------
  s.shadow = clamp(0.75 * E * (0.4 + 0.6 * (1 - V)) + 0.45 * (1 - V) - 0.12);
  s.hatchSpacing = lerp(8, 2.8, E);
  s.hatchStyle = S > 0.5 ? "bold parallel" : s.mess > 0.6 ? "scribble" : D > 0.68 && V > 0.55 ? "stipple" : E > 0.7 ? "cross-hatch" : "parallel";
  s.hatchAngle = ((lerp(28, 62, V) + (A > 0.5 ? 8 : 0)) * Math.PI) / 180;
  s.fillBlacks = clamp(S * 0.9 + E * 0.35 - 0.1);

  // ---------- how they draw people ----------
  s.exaggeration = s.cartoon;
  s.roundness = clamp(0.15 + 0.7 * V + 0.25 * s.cartoon - 0.1 * E);
  s.elongation = (1 - V) * 0.24 * (1 - s.cartoon);
  s.eyeWeights = {
    dot: 0.1 + 2.2 * s.cartoon,
    almond: 0.3 + 1.6 * (1 - s.cartoon) * (0.5 + A),
    round: 0.2 + 1.4 * s.cartoon * E,
    sleepy: 0.05 + 0.7 * (1 - E) * (1 - V),
  };
  s.tilt = 0.05 + 0.45 * t;
  s.droop = clamp((1 - V) * 0.8 - 0.1);
  s.detail = clamp((0.2 + 0.35 * t + 0.35 * E) * (1 - 0.6 * s.cartoon));
  s.variety = 0.35 + 0.65 * VR;

  // ---------- explanation: which music drove which choices ----------
  const pct = (x) => Math.round(x * 100) + "%";
  s.mapping = [
    { input: "Tempo", value: `${Math.round(taste.tempo)} BPM`, level: t, effects: [`shaky hand ${s.jitter.toFixed(1)}px`, `head tilt up to ${Math.round((s.tilt * 180) / Math.PI)}°`, `adds mess`, t > 0.5 ? "ink flicks when loud" : null] },
    { input: "Energy", value: E.toFixed(2), level: E, effects: [`line weight ${s.weight.toFixed(1)}px`, `ink saturation`, `colour ${pct(s.colour)}`, `shading ${pct(s.shadow)}`] },
    { input: "Mood", value: V < 0.35 ? "sad" : V > 0.65 ? "happy" : "mixed", level: V, effects: [`ink hue → ${hueName(hue)}`, `print colour → ${s.accentName}`, V < 0.4 ? "heavy eyelids, long faces" : "rounder faces"] },
    { input: "Acoustic", value: A.toFixed(2), level: A, effects: [pencil ? "soft pencil" : "pen", `loose drift ${s.wobble.toFixed(1)}px`, A > 0.4 ? "sepia ink" : null, s.construction > 0.1 ? "guide lines left in" : null] },
    { input: "Danceable", value: D.toFixed(2), level: D, effects: [`cartoon ${pct(s.cartoon)} (with mood)`, s.cartoon > 0.5 ? "big heads, dot eyes" : "real proportions"] },
    { input: "Rap / spoken", value: S.toFixed(2), level: S, effects: [S > 0.4 ? "bold graphic blacks" : "few solid blacks", "tighter, less mess", "ink → black"] },
    { input: "Variety", value: VR.toFixed(2), level: VR, effects: [`distortion ${pct(s.distort)} (with energy)`, "more different faces", "adds mess"] },
  ].map((m) => ({ ...m, effects: m.effects.filter(Boolean) }));
  s.dials = [
    ["Mess", s.mess],
    ["Cartoon", s.cartoon],
    ["Distortion", s.distort],
    ["Colour", s.colour],
  ];
  return s;
}

// Risograph-style print colours. The mood/energy of the music picks the nearest.
const ACCENTS = [
  { name: "riso blue", hex: "#0078bf", V: 0.15, E: 0.45, A: 0.2 },
  { name: "teal", hex: "#00838a", V: 0.3, E: 0.25, A: 0.4 },
  { name: "purple", hex: "#765ba7", V: 0.3, E: 0.7, A: 0.1 },
  { name: "green", hex: "#00a95c", V: 0.55, E: 0.35, A: 0.5 },
  { name: "sunflower", hex: "#ffb511", V: 0.85, E: 0.55, A: 0.3 },
  { name: "orange", hex: "#ff6c2f", V: 0.65, E: 0.8, A: 0.1 },
  { name: "fluorescent pink", hex: "#ff48b0", V: 0.75, E: 0.95, A: 0.0 },
  { name: "bright red", hex: "#f15060", V: 0.4, E: 0.95, A: 0.05 },
  { name: "brick", hex: "#a75154", V: 0.45, E: 0.3, A: 0.9 },
  { name: "mustard", hex: "#d1a43a", V: 0.6, E: 0.25, A: 0.9 },
];
function pickAccent(V, E, A, S) {
  if (S > 0.8) return { name: "gold", hex: "#c9a227" }; // very rap-heavy
  let best = ACCENTS[0], bd = Infinity;
  for (const c of ACCENTS) {
    const d = (c.V - V) ** 2 + (c.E - E) ** 2 + 0.6 * (c.A - A) ** 2;
    if (d < bd) [bd, best] = [d, c];
  }
  return best;
}

function hueName(h) {
  if (h < 200 || h >= 345) return h < 30 || h >= 345 ? "red" : "warm";
  if (h < 255) return "blue";
  if (h < 290) return "violet";
  return "pink";
}

function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(t))).toString(16).padStart(2, "0")).join("");
}

// Example tastes until real song data arrives (Milestone 4).
// Made-up averages, except the Drake one: real numbers for "Drew A Picasso".
export const EXAMPLE_TASTES = {
  "Drew A Picasso (real)": { tempo: 64, energy: 0.38, valence: 0.15, acousticness: 0.33, danceability: 0.71, speechiness: 0.22, variety: 0.3 },
  "Bedroom folk": { tempo: 84, energy: 0.25, valence: 0.45, acousticness: 0.85, danceability: 0.45, speechiness: 0.04, variety: 0.3 },
  "Sad indie": { tempo: 100, energy: 0.42, valence: 0.18, acousticness: 0.45, danceability: 0.42, speechiness: 0.04, variety: 0.4 },
  "Sunny pop": { tempo: 118, energy: 0.72, valence: 0.82, acousticness: 0.12, danceability: 0.78, speechiness: 0.06, variety: 0.5 },
  "Hyperpop rave": { tempo: 160, energy: 0.92, valence: 0.62, acousticness: 0.04, danceability: 0.74, speechiness: 0.08, variety: 0.8 },
  "Loud rap": { tempo: 90, energy: 0.82, valence: 0.45, acousticness: 0.08, danceability: 0.8, speechiness: 0.34, variety: 0.4 },
  "Punk": { tempo: 176, energy: 0.95, valence: 0.42, acousticness: 0.02, danceability: 0.35, speechiness: 0.07, variety: 0.3 },
  "Ambient": { tempo: 70, energy: 0.12, valence: 0.3, acousticness: 0.7, danceability: 0.2, speechiness: 0.03, variety: 0.2 },
};
