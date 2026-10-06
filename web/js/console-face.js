// The hidden feature: open the browser console and type
//     console.face("song name")
// to get a little text-art face for that song, in the song's own ink colour.

import { deriveStyle } from "./style.js";
import { randomFace } from "./face.js";
import { findSong, guessTaste, applyPersona, normalise, PLAYLIST } from "./songs.js";
import { faceForSong, styleForSong } from "./mapping.js";

const W = 13; // face width in characters

export function songFace(name) {
  const song = findSong(name);
  if (song?.fromPlaylist) {
    // drawn by the artist your playlist defines
    const style = styleForSong(song, PLAYLIST.playlist.taste);
    const { face, audio } = faceForSong(song, style, PLAYLIST.playlist.taste);
    return { song, taste: audio, style, face };
  }
  const taste = song ? song.taste : guessTaste(name);
  const style = deriveStyle(taste);
  let face = randomFace("song:" + normalise(song ? song.title : name), style);
  if (song) face = applyPersona(face, song.persona);
  return { song, taste, style, face };
}

// ---------------------------------------------------------------------
// Turn a face genome into rows of characters, each with a colour role.
// ---------------------------------------------------------------------
export function asciiFace(face, style) {
  const rows = [];
  const hairCol = style.colour > 0.4 && face.hair.fill !== "solid" ? "accent" : "ink";
  const add = (text, col = "ink") => rows.push(text.split("").map((ch) => [ch, col]));
  const fit = (s) => {
    if (s.length >= W) return s; // wider rows (long hair) are centred later
    const l = Math.max(0, Math.floor((W - s.length) / 2));
    return (" ".repeat(l) + s + " ".repeat(W)).slice(0, W);
  };
  const round = face.head.square > 0.82;
  const [L, R] = round ? ["(", ")"] : ["|", "|"];
  const hs = face.acc.beanie ? "beanie" : face.hair.style;
  const longHair = ["long", "wavy", "fringe"].includes(hs);
  const cartoon = style.cartoon > 0.55;

  // --- hair ---
  const zig = (n) => "/\\".repeat(n);
  const tops = {
    curly: [" .@@@@@@@@@. ", "@@@@@@@@@@@@@"],
    afro: ["  .@@@@@@@.  ", " @@@@@@@@@@@ ", "@@@@@@@@@@@@@"],
    short: [" " + zig(5) + "/ "],
    messy: ["  \\ |/ \\| /  ", " " + zig(5) + "/ "],
    swept: ["   _.~~~~~~. ", "  /~~~~~~~~\\ "],
    long: ["  .---------.  ", " /           \\ "],
    wavy: ["  .~~~~~~~~~.  ", " (~~~~~~~~~~~) "],
    fringe: ["  .---------.  ", " |===========| "],
    bun: ["     (@)     ", "  .-------.  "],
    buzz: ["  .........  "],
    bald: ["   _______   "],
    beanie: ["     (*)     ", "  .-------.  ", " (#########) "],
  }[hs] ?? ["  .-------.  "];
  for (const t of tops) add(fit(t), hairCol);

  // inner rows are 11 characters between the face sides
  const inner = () => Array.from({ length: W - 2 }, () => [" ", "ink"]);
  const put = (row, col, ch, c = "ink") => {
    if (col >= 0 && col < row.length) row[col] = [ch, c];
  };
  const wrap = (row, l = L, r = R) => [[l, "ink"], ...row, [r, "ink"]];

  // forehead
  const fh = inner();
  if (hs === "fringe") fh.forEach((_, i) => put(fh, i, "|", hairCol));
  if (face.details.wrinkles > 0.4) [3, 4, 5, 6, 7].forEach((i) => put(fh, i, "~"));
  rows.push(wrap(fh));

  // eye columns, wider apart for cartoon faces; Picasso can knock one eye up a row
  const [eL, eR] = cartoon ? [2, 8] : [3, 7];
  const lift = face.warp.eyeDy.map((d) => (d > 0.07 ? 1 : 0));

  // brows
  const br = inner();
  const tilt = face.brows.tilt - style.droop * 0.6;
  const [bl, brr] = tilt < -0.25 ? ["/", "\\"] : tilt > 0.3 ? ["\\", "/"] : face.eyes.lid > 0.35 ? ["_", "_"] : ["~", "~"];
  put(br, eL, bl);
  put(br, eR, brr);
  // eyes
  const ey = inner();
  const e = face.eyes;
  const eyeCh = e.type === "dot" ? "•" : e.type === "round" ? (cartoon ? "@" : "O") : e.type === "sleepy" ? (face.mouth.smile > 0.35 ? "^" : "-") : "o";
  const g = face.acc.glasses;
  if (g) {
    const lens = g === "sun" ? "#" : eyeCh;
    const [a, b] = g === "round" ? ["(", ")"] : ["[", "]"];
    for (const [c, row] of [[eL, lift[0] ? br : ey], [eR, lift[1] ? br : ey]]) {
      put(row, c - 1, a);
      put(row, c, lens);
      put(row, c + 1, b);
    }
    for (let c = eL + 2; c <= eR - 2; c++) put(ey, c, "-");
  } else {
    put(lift[0] ? br : ey, eL, eyeCh);
    put(lift[1] ? br : ey, eR, eyeCh);
  }
  rows.push(wrap(br));
  const ears = !longHair && !face.acc.headphones;
  if (ears || face.acc.headphones) rows.push([[ears ? (round ? "c" : "(") : "@", "ink"], ...wrap(ey), [ears ? (round ? "ɔ" : ")") : "@", "ink"]]);
  else rows.push(wrap(ey));

  // nose row: nose, cheeks, freckles, tear
  const ns = inner();
  const n = face.nose;
  const nc = 5 + Math.round(Math.sign(face.warp.noseYaw) * (Math.abs(face.warp.noseYaw) > 0.4 ? 2 : 0));
  if (n.kind === "wide") {
    put(ns, nc - 1, "(");
    put(ns, nc + 1, ")");
  } else put(ns, nc, Math.abs(face.warp.noseYaw) > 0.4 ? (face.warp.noseYaw > 0 ? ">" : "<") : n.kind === "button" ? "u" : n.kind === "long" ? ">" : n.side > 0 ? "L" : "J");
  if (face.details.blush || style.colour > 0.25) {
    put(ns, eL - 2, "*", "accent");
    put(ns, eR + 2, "*", "accent");
  }
  if (face.details.freckles > 0) {
    put(ns, eL - 1, ":");
    put(ns, eR + 1, ":");
  }
  if (face.acc.tear) put(ns, eR, ",", "accent");
  rows.push(wrap(ns));

  // mouth
  const m = face.mouth;
  let mouth = m.open > 0.05 ? (m.smile > 0.3 ? (cartoon ? "\\_____/" : "\\___/") : "O") : m.smile > 0.5 ? "\\___/" : m.smile > 0.15 ? "\\_/" : m.smile < -0.45 ? "/~~~\\" : m.smile < -0.15 ? "/-\\" : "---";
  if (Math.abs(m.smirk) > 0.4 && m.open < 0.05) mouth = m.smirk > 0 ? "__/" : "\\__";
  const mo = inner();
  const shiftM = Math.round(face.warp.mouthDu * 12);
  const start = Math.floor((W - 2 - mouth.length) / 2) + shiftM;
  mouth.split("").forEach((ch, i) => put(mo, start + i, ch));
  if (face.details.stubble > 0) [1, 2, 8, 9].forEach((i) => mo[i][0] === " " && put(mo, i, "."));
  rows.push(wrap(mo));

  // chin
  const fillCh = face.details.stubble > 0 ? ":" : "_";
  add(round ? " \\" + fillCh.repeat(W - 4) + "/ " : "|" + fillCh.repeat(W - 2) + "|");

  // long hair hangs down both sides
  if (longHair) {
    const h = hs === "wavy" ? "~" : "|";
    const first = tops.length;
    for (let i = first; i < rows.length; i++) {
      const extra = rows[i].length > W; // eye row with headphones is already wider
      rows[i] = extra ? rows[i] : [[h, hairCol], ...rows[i], [h, hairCol]];
    }
    if (hs !== "fringe") for (let k = 0; k < 2; k++) rows.push([[h, hairCol], ...Array.from({ length: W }, () => [" ", "ink"]), [h, hairCol]]);
  }
  if (face.acc.chain) rows.push((" ".repeat(Math.floor(W / 2) - 2) + "o-o-o").split("").map((ch) => [ch, "accent"]));

  // centre every row
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const l = Math.floor((width - r.length) / 2);
    return [...Array.from({ length: l }, () => [" ", "ink"]), ...r];
  });
}

// Rows -> one console.log call with %c colour segments.
function print(rows, style) {
  const base = "font-family: ui-monospace, Menlo, monospace; font-size: 15px; line-height: 1.15; font-weight: 600;";
  const css = { ink: `${base} color: ${style.ink};`, accent: `${base} color: ${style.accent};` };
  let fmt = "";
  const args = [];
  rows.forEach((row, ri) => {
    let cur = null;
    for (const [ch, col] of row) {
      if (col !== cur) {
        fmt += "%c";
        args.push(css[col]);
        cur = col;
      }
      fmt += ch === "%" ? "%%" : ch;
    }
    if (ri < rows.length - 1) fmt += "\n";
  });
  console.log(fmt, ...args);
}

export function installConsoleFace() {
  const face = (name) => {
    if (!name || typeof name !== "string") {
      console.log('%cusage: console.face("song name")', "font-family: ui-monospace, Menlo, monospace; color: #888");
      return;
    }
    const { song, style, taste, face: f } = songFace(name);
    print(asciiFace(f, style), style);
    const title = song ? `${song.title} · ${song.artist}` : name;
    const mood = taste.valence < 0.35 ? "sad" : taste.valence > 0.65 ? "happy" : "bittersweet";
    console.log(`%c${title}%c\n${style.pen} · ${style.accentName} · ${mood} · ${Math.round(taste.tempo)} BPM`, "font-family: Caveat, cursive; font-size: 22px; color: " + style.ink, "font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #888");
    if (song?.persona) console.log(`%c“${song.persona.summary}”`, "font-family: Georgia, serif; font-style: italic; font-size: 12px; color: #666");
    if (!song) console.log("%c(no data for this song yet, so this face is a guess from its name)", "font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #aaa; font-style: italic");
  };
  Object.defineProperty(console, "face", { value: face, configurable: true, writable: true });

  // a whisper for anyone who opens the console
  console.log(
    "%cconsole.face()%c\npsst. try %cconsole.face(\"your favourite song\")",
    "font-family: ui-monospace, Menlo, monospace; font-size: 20px; font-weight: 700; color: #161616",
    "font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #888",
    "font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #0078bf"
  );
}
