// The demo flow: paste a playlist -> an iPod showing the songs on the left,
// and on the right each song's face sketching itself (in that song's own
// style, at its own tempo), then turning to look towards the others.

import { drawFace, FRAME } from "./face.js";
import { animateDrawing } from "./animate.js";
import { setPlaylist } from "./songs.js";
import { faceForSong, styleForSong } from "./mapping.js";
import { installConsoleFace } from "./console-face.js";

installConsoleFace();

const $ = (s) => document.querySelector(s);
const SPEED = 2.2; // faces draw faster than the single big view
const STAGGER = 1.3; // seconds between one song starting and the next
const TURN_FRAMES = 8; // flipbook frames for the head turn
const FPS = 9; // flipbook speed: low on purpose, like hand-drawn animation
const shortTitle = (t) => t.replace(/\s*\(.*$|\s+-\s.*$/, "");
const mmss = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "");

$("#link").focus();
$("#form").onsubmit = async (e) => {
  e.preventDefault();
  const link = $("#link").value.trim();
  $("#error").textContent = "";
  if (!/open\.spotify\.com\/playlist\/[A-Za-z0-9]+/.test(link)) {
    $("#error").textContent = "that doesn't look like a spotify playlist link";
    return;
  }
  show("loading");
  const minWait = new Promise((r) => setTimeout(r, 1600));
  try {
    const [data] = await Promise.all([fetchPlaylist(link), minWait]);
    start(data);
  } catch (err) {
    show("start");
    $("#error").textContent = err.message;
  }
};

async function fetchPlaylist(link) {
  // live lookup through the local server (serve.py) ...
  try {
    const res = await fetch("api/playlist?url=" + encodeURIComponent(link));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "couldn't read that playlist");
    return data;
  } catch (err) {
    // ... or, on a plain static host, the playlist that was built ahead of time
    const res = await fetch("data/songs.json", { cache: "no-store" }).catch(() => null);
    const saved = res && res.ok ? await res.json() : null;
    const id = (u) => (u.match(/playlist\/([A-Za-z0-9]+)/) || [])[1];
    if (saved && id(saved.playlist.url) === id(link)) return saved;
    throw err;
  }
}

function show(name) {
  for (const id of ["start", "loading", "show"]) $("#" + id).hidden = id !== name;
}

// ---------------------------------------------------------------------
let songs = [];
let people = []; // per song: { song, style, face, audio, svg, frames }

function start(data) {
  setPlaylist(data);
  const taste = data.playlist.taste;
  songs = data.songs;
  people = songs.map((song) => {
    const style = styleForSong(song, taste); // each song is its own artist
    const { face, audio } = faceForSong(song, style, taste);
    return { song, style, face, audio };
  });

  // the iPod
  $("#lcd-title").textContent = data.playlist.name;
  $("#tracks").innerHTML = songs.map((s, i) => `<li data-i="${i}"><span>${shortTitle(s.title)}</span><span>${mmss(s.duration_ms)}</span></li>`).join("");
  $("#tracks").onclick = (e) => {
    const li = e.target.closest("li");
    if (li) openBig(+li.dataset.i);
  };

  // the crowd of faces
  const crowd = $("#crowd");
  crowd.innerHTML = people.map((_, i) => `<svg data-i="${i}" viewBox="0 0 ${FRAME.width} ${FRAME.height}" preserveAspectRatio="xMidYMid meet"></svg>`).join("");
  people.forEach((p, i) => (p.svg = crowd.children[i]));
  crowd.onclick = (e) => {
    const svg = e.target.closest("svg[data-i]");
    if (svg) openBig(+svg.dataset.i);
  };
  show("show");
  layout();
  addEventListener("resize", layout);

  people.forEach((p, i) =>
    setTimeout(() => {
      nowPlaying(i);
      animateDrawing(p.svg, drawFace(p.face, p.style), p.style, {
        width: FRAME.width,
        height: FRAME.height,
        speed: SPEED,
        timing: p.audio, // the song sets its own drawing rhythm
        onDone: () => turnTowardsOthers(i),
      });
    }, 500 + i * STAGGER * 1000)
  );
}

// Fit all the faces on screen: pick the column count that gives the biggest faces.
function layout() {
  const crowd = $("#crowd");
  const W = crowd.clientWidth, H = crowd.clientHeight || innerHeight * 0.92;
  const n = people.length, ratio = FRAME.width / FRAME.height;
  let best = { h: 0, cols: 1, rows: n };
  for (let cols = 2; cols <= 10; cols++) {
    const rows = Math.ceil(n / cols);
    const h = Math.min(H / rows, W / cols / ratio);
    if (h > best.h) best = { h, cols, rows };
  }
  crowd.style.gridTemplateColumns = `repeat(${best.cols}, ${Math.floor(best.h * ratio)}px)`;
  crowd.style.gridAutoRows = `${Math.floor(best.h)}px`;
}

// The iPod highlights the song being drawn and keeps it in view.
function nowPlaying(i) {
  const list = $("#tracks");
  [...list.children].forEach((li, k) => {
    li.classList.toggle("now", k === i);
    li.classList.toggle("done", k < i);
  });
  const li = list.children[i];
  const top = li.offsetTop - list.clientHeight / 2 + li.clientHeight / 2;
  list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  $("#lcd-progress").style.width = `${((i + 1) / people.length) * 100}%`;
}

// ---------------------------------------------------------------------
// Turning heads: each finished face turns to look towards the middle of the
// crowd. The turn is a short flipbook of redrawn frames, then the lines keep
// gently "boiling" like hand-drawn animation.
// ---------------------------------------------------------------------
const queue = [];
let busy = false;
function work() {
  if (busy || !queue.length) return;
  busy = true;
  setTimeout(() => {
    queue.shift()();
    busy = false;
    work();
  }, 0);
}

function turnTowardsOthers(i) {
  const p = people[i];
  const crowd = $("#crowd").getBoundingClientRect();
  const me = p.svg.getBoundingClientRect();
  const dx = (me.left + me.width / 2 - (crowd.left + crowd.width / 2)) / (crowd.width / 2);
  const dy = (me.top + me.height / 2 - (crowd.top + crowd.height / 2)) / (crowd.height / 2);
  const from = p.face.pose;
  const to = {
    yaw: Math.max(-0.85, Math.min(0.85, -dx * 0.85)), // left side looks right, right side looks left
    pitch: -dy * 0.22, // top rows look down, bottom rows look up
    roll: from.roll * 0.5,
  };
  p.frames = [];
  for (let k = 1; k <= TURN_FRAMES + 2; k++) {
    const t = Math.min(1, k / TURN_FRAMES);
    const e = t * t * (3 - 2 * t);
    const pose = { yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e, roll: from.roll + (to.roll - from.roll) * e };
    queue.push(() => p.frames.push(drawFace(p.face, p.style, pose, { inkSeed: `${p.face.seed}:f${k}` }).innerSVG({ width: FRAME.width, height: FRAME.height })));
  }
  queue.push(() => play(p));
  work();
}

function play(p) {
  let k = 0;
  const turn = setInterval(() => {
    p.svg.innerHTML = p.frames[Math.min(k, TURN_FRAMES - 1)];
    if (++k >= TURN_FRAMES) {
      clearInterval(turn);
      // keep the drawing alive: flick between the last few frames
      const last = p.frames.slice(TURN_FRAMES - 1);
      let b = 0;
      setInterval(() => (p.svg.innerHTML = last[b++ % last.length]), 1000 / 4);
    }
  }, 1000 / FPS);
}

// ---------------------------------------------------------------------
// One face, big
// ---------------------------------------------------------------------
let bigAnim = null;
function openBig(i) {
  const p = people[i];
  if (!p) return;
  $("#big").hidden = false;
  bigAnim?.stop();
  bigAnim = animateDrawing($("#big-svg"), drawFace(p.face, p.style), p.style, { width: FRAME.width, height: FRAME.height, timing: p.audio });
}
function closeBig() {
  bigAnim?.stop();
  $("#big").hidden = true;
}
$("#close").onclick = closeBig;
addEventListener("keydown", (e) => e.key === "Escape" && closeBig());
