// Songs we have real data for. Milestone 4's pipeline will generate this
// list automatically; for now it holds the one song we analysed by hand
// (see samples/drew-a-picasso.json). No lyrics are ever stored here.

import { makeRng } from "./rng.js";

export const KNOWN_SONGS = [
  {
    title: "Drew A Picasso",
    artist: "Drake",
    // felt tempo is half of the detected 128 BPM
    taste: { tempo: 64, energy: 0.377, valence: 0.147, acousticness: 0.334, danceability: 0.709, speechiness: 0.219, variety: 0.15 },
    persona: {
      summary: "A proud man up too late, hurt but pretending he isn't.",
      sentiment: "bitter",
      details: ["averted gaze", "half smirk", "heavy-lidded", "stubble", "gold chain"],
    },
  },
];

export const normalise = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function findSong(name) {
  const q = normalise(name);
  return KNOWN_SONGS.find((s) => normalise(s.title) === q || normalise(`${s.title} ${s.artist}`) === q || normalise(`${s.artist} ${s.title}`) === q) ?? null;
}

// For songs we don't know yet: a made-up but consistent taste from the name,
// so the same name always gives the same face.
export function guessTaste(name) {
  const r = makeRng("guess:" + normalise(name));
  return {
    tempo: Math.round(r.range(68, 172)),
    energy: r.range(0.1, 0.95),
    valence: r.range(0.05, 0.95),
    acousticness: r.range(0, 0.9),
    danceability: r.range(0.2, 0.9),
    speechiness: r.chance(0.25) ? r.range(0.2, 0.4) : r.range(0.02, 0.1),
    variety: 0.15,
  };
}

// A first taste of Milestone 5: persona details nudge the face.
export function applyPersona(face, persona) {
  if (!persona) return face;
  const f = structuredClone(face);
  const has = (k) => persona.details.some((d) => d.includes(k));
  if (has("averted")) f.eyes.gaze = [0.85, -0.2];
  if (has("smirk")) Object.assign(f.mouth, { smirk: 0.75, smile: 0.05, open: 0 });
  if (has("heavy-lid")) f.eyes.lid = Math.max(f.eyes.lid, 0.5);
  if (has("stubble")) f.details.stubble = 0.85;
  if (has("chain")) f.acc.chain = true;
  if (has("tear")) f.acc.tear = true;
  if (has("sunglasses")) f.acc.glasses = "sun";
  if (persona.sentiment === "bitter" || persona.sentiment === "sad") f.mouth.smile = Math.min(f.mouth.smile, 0);
  return f;
}
