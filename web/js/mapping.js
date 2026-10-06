// =====================================================================
//  SONG -> FACE: how one song's numbers shape its sitter
// =====================================================================
// The playlist decides HOW faces are drawn (style.js, "the artist").
// This file decides WHO each song is: expression, hair, pose, accessories.
//
// Each rule has a strength (0 = ignore, 1 = normal, 2 = exaggerate) so you
// can tune the mapping without touching the code below it.
// =====================================================================

import { makeRng } from "./rng.js";
import { randomFace } from "./face.js";
import { clamp, lerp } from "./geom.js";
import { applyPersona, guessTaste } from "./songs.js";
import { deriveStyle } from "./style.js";

export const FACE_RULES = {
  // mood (valence): happy songs smile and raise their brows; sad songs frown, brows knit
  mood: 1,
  // energy: loud songs open their mouths and eyes, get darker, heavier hair
  energy: 1,
  // felt tempo: fast songs tilt and turn their heads, hair gets messier
  tempo: 1,
  // sound (acoustic / rap / dance): picks hair style and accessories
  sound: 1,
  // lyric persona (when available): averted gaze, smirks, tears, chains...
  persona: 1,
};

// Hair styles each kind of sound leans towards. Add or change freely.
const HAIR_BY_SOUND = {
  acoustic: { long: 3, wavy: 3, curly: 1.5, fringe: 1.5, bun: 1 },
  rap: { short: 3, buzz: 2.5, messy: 1, fringe: 0.5, bald: 0.6 },
  dance: { curly: 3, afro: 2, bun: 2, swept: 1.5 },
  loud: { messy: 3, short: 1.5, swept: 1.5, afro: 1 },
};

// The song's numbers, or the playlist's average for songs we have no audio data for.
export function songAudio(song, playlistTaste) {
  const a = song.audio;
  if (!a) return { ...playlistTaste, missing: true };
  return {
    tempo: song.tempo_felt ?? a.tempo,
    energy: a.energy,
    valence: a.valence,
    acousticness: a.acousticness,
    danceability: a.danceability,
    speechiness: a.speechiness,
  };
}

// Each song is its own artist: its genre and sound pick the pen, ink and mess.
// Songs without audio data lean on their lyric persona and their name instead.
const MOOD_OF = { happy: 0.8, playful: 0.72, confident: 0.6, hopeful: 0.6, bittersweet: 0.42, longing: 0.3, anxious: 0.28, bitter: 0.2, sad: 0.15 };
export function tasteForSong(song, playlistTaste) {
  const a = songAudio(song, playlistTaste);
  if (a.missing) {
    const g = guessTaste(song.title + " " + song.artist);
    for (const k of ["tempo", "energy", "acousticness", "danceability", "speechiness"]) a[k] = lerp(playlistTaste[k], g[k], 0.6);
    a.valence = MOOD_OF[song.persona?.sentiment] ?? lerp(playlistTaste.valence, g.valence, 0.6);
  }
  return { ...a, variety: 0.35 };
}

export function styleForSong(song, playlistTaste) {
  return deriveStyle(tasteForSong(song, playlistTaste));
}

// Build the face for a song, in a given artist's style. Returns { face, why, audio }.
export function faceForSong(song, style, playlistTaste) {
  const k = FACE_RULES;
  const a = tasteForSong(song, playlistTaste);
  const r = makeRng("map:" + song.id);
  const face = randomFace("song:" + song.id, style);
  const why = [];
  const t = clamp((a.tempo - 60) / 120);

  // ---- mood ----
  const smile = lerp(-0.75, 0.9, a.valence);
  face.mouth.smile = lerp(face.mouth.smile, smile, clamp(0.85 * k.mood));
  face.brows.tilt = lerp(face.brows.tilt, lerp(-0.8, 0.3, a.valence), clamp(0.6 * k.mood));
  if (a.valence < 0.25 && r.chance(0.35 * k.mood)) face.acc.tear = true;
  why.push([`mood ${a.valence.toFixed(2)}`, a.valence < 0.35 ? "frown, worried brows" : a.valence > 0.65 ? "big smile" : "half smile"]);

  // ---- energy ----
  face.eyes.lid = lerp(face.eyes.lid, lerp(0.55, 0, a.energy), clamp(0.7 * k.energy));
  face.mouth.open = a.energy > 0.72 && r.chance(0.65 * k.energy) ? r.range(0.4, 1) : a.energy < 0.4 ? 0 : face.mouth.open;
  if (a.energy > 0.7 && r.chance(0.5 * k.energy)) face.hair.fill = "solid";
  why.push([`energy ${a.energy.toFixed(2)}`, a.energy > 0.7 ? "open mouth, dark hair" : a.energy < 0.4 ? "sleepy lids, closed mouth" : "relaxed eyes"]);

  // ---- tempo ----
  const sway = lerp(0.35, 1.9, t) * k.tempo;
  face.pose.yaw *= sway;
  face.pose.roll *= sway;
  why.push([`${Math.round(a.tempo)} BPM`, t > 0.55 ? "head tilted, turning" : t < 0.25 ? "still, facing you" : "slight lean"]);

  // ---- sound: hair and accessories ----
  const weights = {};
  const addWeights = (table, amount) => {
    for (const [h, w] of Object.entries(table)) weights[h] = (weights[h] ?? 0.05) + w * amount;
  };
  addWeights(HAIR_BY_SOUND.acoustic, a.acousticness);
  addWeights(HAIR_BY_SOUND.rap, clamp(a.speechiness / 0.3));
  addWeights(HAIR_BY_SOUND.dance, a.danceability * a.valence);
  addWeights(HAIR_BY_SOUND.loud, a.energy * t);
  if (k.sound > 0) face.hair.style = r.weighted(weights);
  const rap = clamp(a.speechiness / 0.3);
  if (rap > 0.5 && r.chance(0.5 * k.sound)) face.acc.chain = true;
  if (rap > 0.4 && a.valence < 0.5 && r.chance(0.35 * k.sound)) face.acc.glasses = "sun";
  if (a.acousticness > 0.55 && r.chance(0.3 * k.sound)) face.acc.glasses = "round";
  if (a.danceability > 0.75 && r.chance(0.25 * k.sound)) face.acc.headphones = true;
  why.push([rap > 0.5 ? "rap-heavy" : a.acousticness > 0.5 ? "acoustic" : a.danceability > 0.7 ? "danceable" : "mixed sound", `${face.hair.style} hair` + (face.acc.chain ? ", chain" : "") + (face.acc.glasses === "sun" ? ", shades" : "")]);

  // ---- lyric persona ----
  let out = face;
  if (song.persona && k.persona > 0) {
    out = applyPersona(face, song.persona);
    why.push(["lyrics", song.persona.summary]);
  } else why.push(["lyrics", "no persona yet (needs a Claude API key)"]);
  if (a.missing) why.unshift(["no audio data", "using the playlist's average"]);

  return { face: out, why, audio: a };
}
