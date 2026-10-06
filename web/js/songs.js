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

// Filled in by loadPlaylist() from data/songs.json (written by pipeline/build_songs.py)
export let PLAYLIST = null;

export async function loadPlaylist() {
  try {
    const res = await fetch("data/songs.json", { cache: "no-store" });
    if (res.ok) PLAYLIST = await res.json();
  } catch {
    PLAYLIST = null;
  }
  return PLAYLIST;
}

export const normalise = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const matches = (q, s) => {
  const title = normalise(s.title.replace(/\s*\(.*$|\s+-\s.*$/, "")); // ignore "(feat. ...)" and " - Remastered"
  const artist = normalise(s.artist.split(",")[0]);
  return [normalise(s.title), title, `${title} ${artist}`, `${artist} ${title}`].includes(q);
};

// Look a song up by name: first your playlist, then the hand-made samples.
export function findSong(name) {
  const q = normalise(name);
  const fromPlaylist = PLAYLIST?.songs.find((s) => matches(q, s));
  if (fromPlaylist) return { ...fromPlaylist, fromPlaylist: true };
  return KNOWN_SONGS.find((s) => matches(q, s)) ?? null;
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

// Lyric persona -> face. Each detail phrase nudges one part of the face.
// Add new phrases here; they're matched as plain text inside persona.details.
const DETAIL_RULES = [
  ["averted", (f) => (f.eyes.gaze = [0.85, -0.15])],
  ["looking up", (f) => ((f.eyes.gaze = [0.15, 1]), (f.pose.pitch = -0.1))],
  ["looking down", (f) => ((f.eyes.gaze = [-0.1, -1]), (f.pose.pitch = 0.14))],
  ["eyes closed", (f) => (f.eyes.type = "sleepy")],
  ["wide eyes", (f) => ((f.eyes.lid = 0), (f.eyes.w *= 1.2), f.eyes.type === "sleepy" && (f.eyes.type = "round"))],
  ["heavy-lid", (f) => (f.eyes.lid = Math.max(f.eyes.lid, 0.5))],
  ["smirk", (f) => Object.assign(f.mouth, { smirk: 0.75, smile: 0.05, open: 0 })],
  ["big grin", (f) => Object.assign(f.mouth, { smile: 0.95, open: 0.65, smirk: 0 })],
  ["open mouth", (f) => (f.mouth.open = Math.max(f.mouth.open, 0.7))],
  ["frown", (f) => Object.assign(f.mouth, { smile: -0.65, open: 0, smirk: 0 })],
  ["tear", (f) => (f.acc.tear = true)],
  ["stubble", (f) => (f.details.stubble = 0.85)],
  ["freckles", (f) => (f.details.freckles = 20)],
  ["blush", (f) => (f.details.blush = true)],
  ["chain", (f) => (f.acc.chain = true)],
  ["sunglasses", (f) => (f.acc.glasses = "sun")],
  ["round glasses", (f) => (f.acc.glasses = "round")],
  ["headphones", (f) => (f.acc.headphones = true)],
  ["earring", (f) => (f.acc.earring = true)],
  ["beanie", (f) => (f.acc.beanie = true)],
  ["messy hair", (f) => (f.hair.style = "messy")],
  ["long hair", (f) => (f.hair.style = "long")],
  ["wavy hair", (f) => (f.hair.style = "wavy")],
  ["curly hair", (f) => (f.hair.style = "curly")],
  ["buzz", (f) => (f.hair.style = "buzz")],
  ["bun", (f) => (f.hair.style = "bun")],
  ["fringe", (f) => (f.hair.style = "fringe")],
  ["head tilted", (f) => (f.pose.roll = (f.pose.roll >= 0 ? 1 : -1) * 0.22)],
];

const HAPPY = ["happy", "playful", "confident", "hopeful"];
const SAD = ["sad", "bitter", "longing", "heartbroken", "anxious", "bittersweet"];

export function applyPersona(face, persona) {
  if (!persona) return face;
  const f = structuredClone(face);
  // the overall feeling first...
  if (HAPPY.includes(persona.sentiment)) f.mouth.smile = Math.max(f.mouth.smile, 0.35);
  if (SAD.includes(persona.sentiment)) {
    f.mouth.smile = Math.min(f.mouth.smile, persona.sentiment === "bittersweet" ? 0.05 : -0.3);
    f.brows.tilt = Math.min(f.brows.tilt, -0.3);
  }
  if (persona.sentiment === "anxious") f.brows.tilt = -0.8;
  // ...then the specific details, which win
  for (const detail of persona.details) {
    const d = detail.toLowerCase();
    for (const [phrase, apply] of DETAIL_RULES) if (d.includes(phrase)) apply(f);
  }
  // sunglasses and round glasses both contain "glasses": the more specific one wins
  if (persona.details.some((d) => d.toLowerCase().includes("round glasses"))) f.acc.glasses = "round";
  return f;
}
