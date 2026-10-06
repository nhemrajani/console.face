// =====================================================================
//  THE ARTIST: music taste -> drawing style
// =====================================================================
// A "taste" is a summary of a set of songs (your favourites, or a
// playlist): averages of tempo, energy, mood and so on. This file turns
// that summary into an artist's habits: which pen they use, how shaky
// their hand is, how much they shade, how cartoony their proportions are.
//
// Every face drawn with the same taste shares these habits, so a sheet of
// faces looks like one person's sketchbook.
//
// Taste fields (all 0..1 except tempo):
//   tempo         average BPM (use the "felt" tempo, i.e. half-time for most rap)
//   energy        loud / intense vs. quiet / gentle
//   valence       happy / bright vs. sad / dark (Spotify-style "mood")
//   acousticness  acoustic instruments vs. electronic production
//   danceability  groove / bounce
//   speechiness   rap / spoken words (0.33+ is very rap-heavy)
//   variety       how different the songs are from each other
// =====================================================================

import { clamp, lerp } from "./geom.js";

// Tweak these to change how strongly each musical trait pushes the style.
export const STYLE_RULES = {
  // line weight in px: quiet music -> fine lines, loud music -> heavy lines
  weight: { base: 0.7, perEnergy: 2.4, perRap: 1.3 },
  // high-frequency shake in px: fast tempo -> scratchy, nervous lines
  jitter: { base: 0.1, perTempo: 2.8 },
  // slow drift in px: acoustic / sad music -> loose, wandering lines
  wobble: { base: 0.3, perAcoustic: 2.4, perSadQuiet: 0.9 },
  // shading: energetic and dark music -> more hatching
  shadow: { perEnergy: 0.75, perSad: 0.45 },
  // cartoon exaggeration: danceable + happy -> bigger eyes, rounder heads
  exaggeration: { base: 0.12, perHappyDance: 0.8, perFastLoud: 0.3 },
};

export function deriveStyle(taste) {
  const R = STYLE_RULES;
  const tempo = clamp((taste.tempo - 60) / 120); // 60 BPM -> 0, 180 BPM -> 1
  const E = clamp(taste.energy);
  const V = clamp(taste.valence);
  const A = clamp(taste.acousticness);
  const D = clamp(taste.danceability);
  const S = clamp(taste.speechiness / 0.35); // rap-ness, 0..1
  const VR = clamp(taste.variety ?? 0.4);

  const s = { taste };

  // ---- the pen ----
  s.weight = R.weight.base + R.weight.perEnergy * E + R.weight.perRap * S;
  s.pressureVar = clamp(0.1 + 0.5 * A + 0.2 * D * (1 - S), 0, 0.75); // brush-like thick/thin
  s.taper = clamp(0.25 + 0.6 * A - 0.3 * S + 0.2 * (1 - E));
  s.jitter = R.jitter.base + R.jitter.perTempo * tempo * (0.4 + 0.6 * E);
  s.wobble = R.wobble.base + R.wobble.perAcoustic * A * (1 - S) + R.wobble.perSadQuiet * (1 - V) * (1 - E);
  s.overshoot = 1.5 + 7 * tempo + 4 * A; // px past the end of a line
  s.passes = 1 + (A * (1 - E) > 0.3 ? 1 : 0) + (tempo > 0.6 && E > 0.6 ? 1 : 0); // re-traced lines
  s.passSpread = 0.5 + 2.2 * tempo;
  s.lineBreaks = Math.round(1 + 2 * A + 1.5 * tempo); // pen lifts on long outlines
  s.construction = clamp(A * (1 - S) * 1.3 - 0.2); // faint guide lines left visible

  const pencil = A > 0.55 && E < 0.45;
  s.inkOpacity = pencil ? 0.8 : 0.95;
  // ink colour: sad + quiet -> blue-black, warm acoustic -> sepia, loud -> pure black
  s.ink = mixHex(mixHex(pencil ? "#3b3b3b" : "#161616", "#1c2a52", (1 - V) * (1 - E) * 1.1), "#4a2f1c", A * V * 1.2 * (1 - E));
  s.pen = pencil ? "soft pencil" : E > 0.72 || S > 0.65 ? "fat marker" : s.pressureVar > 0.4 ? "brush pen" : tempo > 0.6 ? "scratchy ballpoint" : "fineliner";

  // ---- shading habits ----
  s.shadow = clamp(R.shadow.perEnergy * E * (0.4 + 0.6 * (1 - V)) + R.shadow.perSad * (1 - V) - 0.12);
  s.hatchSpacing = lerp(7.5, 3.0, E);
  s.hatchStyle = S > 0.5 ? "bold parallel" : A > 0.55 ? "scribble" : D > 0.68 && V > 0.55 ? "stipple" : E > 0.7 ? "cross-hatch" : "parallel";
  s.hatchAngle = ((lerp(28, 62, V) + (A > 0.5 ? 8 : 0)) * Math.PI) / 180;
  s.fillBlacks = clamp(S * 0.9 + E * 0.35 - 0.1); // solid black areas (hair, shades)

  // ---- how they draw people ----
  s.exaggeration = clamp(R.exaggeration.base + R.exaggeration.perHappyDance * D * V + R.exaggeration.perFastLoud * tempo * E);
  s.roundness = clamp(0.2 + 0.7 * V + 0.15 * D - 0.1 * E);
  s.elongation = (1 - V) * 0.24;
  s.eyeWeights = {
    dot: 0.2 + 1.4 * D * V,
    almond: 0.4 + 1.2 * A + 0.8 * (1 - V),
    round: 0.2 + 1.0 * V * E,
    sleepy: 0.05 + 0.7 * (1 - E) * (1 - V),
  };
  s.tilt = 0.05 + 0.45 * tempo; // how much heads lean / turn
  s.droop = clamp((1 - V) * 0.8 - 0.1); // sad music -> heavier eyelids, lower brows
  s.detail = clamp(0.2 + 0.35 * tempo + 0.35 * E);
  s.variety = 0.35 + 0.65 * VR;

  s.explain = [
    ["Pen", s.pen, pencil ? "acoustic + quiet" : s.pen === "fat marker" ? (S > 0.65 ? "rap-heavy" : "high energy") : s.pen === "brush pen" ? "acoustic warmth" : s.pen === "scratchy ballpoint" ? "fast tempo" : "balanced"],
    ["Line weight", s.weight.toFixed(1) + "px", `energy ${E.toFixed(2)}, rap ${S.toFixed(2)}`],
    ["Shaky hand", s.jitter.toFixed(1) + "px", `tempo ${Math.round(taste.tempo)} BPM`],
    ["Loose drift", s.wobble.toFixed(1) + "px", `acoustic ${A.toFixed(2)}, mood ${V.toFixed(2)}`],
    ["Re-traced lines", `${s.passes}×`, "acoustic + quiet, or fast + loud"],
    ["Guide lines", s.construction > 0.05 ? "visible" : "erased", `acoustic, not rap`],
    ["Shading", `${s.hatchStyle}, ${Math.round(s.shadow * 100)}%`, `energy + sad mood`],
    ["Solid blacks", Math.round(s.fillBlacks * 100) + "%", "rap + energy"],
    ["Cartoon factor", Math.round(s.exaggeration * 100) + "%", `danceable × happy`],
    ["Face shapes", s.roundness > 0.6 ? "round" : s.roundness < 0.35 ? "long, angular" : "mixed", `mood ${V.toFixed(2)}`],
    ["Head tilt", Math.round((s.tilt * 180) / Math.PI) + "°", "tempo"],
    ["Ink", s.ink, (1 - V) * (1 - E) > 0.35 ? "sad + quiet → blue-black" : A * V * (1 - E) > 0.2 ? "warm acoustic → sepia" : "neutral"],
    ["Heavy eyelids", Math.round(s.droop * 100) + "%", `mood ${V.toFixed(2)}`],
  ];
  return s;
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(t))).toString(16).padStart(2, "0")).join("");
}

// Example tastes until real song data arrives (Milestone 4).
// These are made-up averages, not real playlists — except the Drake one,
// which uses the real numbers we fetched for "Drew A Picasso".
export const EXAMPLE_TASTES = {
  "Drew A Picasso (real)": { tempo: 64, energy: 0.38, valence: 0.15, acousticness: 0.33, danceability: 0.71, speechiness: 0.22, variety: 0.3 },
  "Bedroom folk": { tempo: 84, energy: 0.25, valence: 0.45, acousticness: 0.85, danceability: 0.45, speechiness: 0.04, variety: 0.3 },
  "Sad indie": { tempo: 100, energy: 0.42, valence: 0.18, acousticness: 0.45, danceability: 0.42, speechiness: 0.04, variety: 0.4 },
  "Sunny pop": { tempo: 118, energy: 0.72, valence: 0.82, acousticness: 0.12, danceability: 0.78, speechiness: 0.06, variety: 0.5 },
  "Hyperpop rave": { tempo: 160, energy: 0.92, valence: 0.62, acousticness: 0.04, danceability: 0.74, speechiness: 0.08, variety: 0.8 },
  "Loud rap": { tempo: 90, energy: 0.82, valence: 0.45, acousticness: 0.08, danceability: 0.8, speechiness: 0.34, variety: 0.4 },
  "Punk": { tempo: 176, energy: 0.95, valence: 0.42, acousticness: 0.02, danceability: 0.35, speechiness: 0.07, variety: 0.3 },
};
