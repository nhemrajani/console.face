// The start-page flow: paste a playlist -> loading -> a sketchbook page whose
// faces draw themselves, each at its own song's tempo.

import { deriveStyle } from "./style.js";
import { drawFace, FRAME } from "./face.js";
import { animateDrawing } from "./animate.js";
import { setPlaylist } from "./songs.js";
import { faceForSong } from "./mapping.js";
import { installConsoleFace } from "./console-face.js";

installConsoleFace();

const $ = (s) => document.querySelector(s);
const BOOK_SPEED = 2.2; // the grid draws a bit faster than the single big face
const STAGGER = 1.3; // seconds between one face starting and the next
const shortTitle = (t) => t.replace(/\s*\(.*$|\s+-\s.*$/, "");

const LINES = ["reading the playlist", "listening for tempo", "feeling out the mood", "reading between the lyrics", "mixing the inks", "sharpening the pencil", "finding the artist"];

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
  const stopLines = cycleLines();
  const minWait = new Promise((r) => setTimeout(r, 2800)); // long enough to read, short enough to film
  try {
    const [data] = await Promise.all([fetchPlaylist(link), minWait]);
    stopLines();
    startBook(data);
  } catch (err) {
    stopLines();
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

function cycleLines() {
  let i = 0;
  const el = $("#status");
  const next = () => {
    el.textContent = LINES[i++ % LINES.length] + "…";
    el.classList.remove("fade-in");
    void el.offsetWidth;
    el.classList.add("fade-in");
  };
  next();
  const t = setInterval(next, 1300);
  return () => clearInterval(t);
}

function show(name) {
  for (const id of ["start", "loading", "show"]) $("#" + id).hidden = id !== name;
}

// ---------------------------------------------------------------------
// The sketchbook page
// ---------------------------------------------------------------------
let anims = [];
let timers = [];

function startBook(data) {
  setPlaylist(data);
  const taste = data.playlist.taste;
  const style = deriveStyle(taste);
  const songs = data.songs;

  $("#pl-name").textContent = data.playlist.name;
  $("#pl-meta").textContent = `${data.playlist.owner} · ${songs.length} songs · ${Math.round(taste.tempo)} BPM average`;
  $("#artist").innerHTML = `drawn with a ${style.pen}<br>ink<span class="sw" style="background:${style.ink}"></span> print<span class="sw" style="background:${style.accent}"></span>${style.accentName}`;

  const book = $("#book");
  book.innerHTML = songs
    .map((s, i) => `<div class="cell" data-i="${i}"><svg viewBox="0 0 ${FRAME.width} ${FRAME.height}"></svg><div class="t">${shortTitle(s.title)}<small>${s.artist.split(",")[0]}</small></div></div>`)
    .join("");
  show("show");
  window.scrollTo(0, 0);

  const faces = songs.map((s) => faceForSong(s, style, taste));
  let userScrolled = false;
  const markScroll = () => (userScrolled = true);
  window.addEventListener("wheel", markScroll, { once: true });
  window.addEventListener("touchmove", markScroll, { once: true });

  songs.forEach((song, i) => {
    const t = setTimeout(() => {
      const cell = book.children[i];
      cell.classList.add("on");
      anims.push(animateDrawing(cell.querySelector("svg"), drawFace(faces[i].face, style), style, { width: FRAME.width, height: FRAME.height, speed: BOOK_SPEED, timing: faces[i].audio }));
      // follow the drawing down the page, unless the viewer has taken over scrolling
      const r = cell.getBoundingClientRect();
      if (!userScrolled && r.bottom > innerHeight - 20) window.scrollBy({ top: r.bottom - innerHeight + 80, behavior: "smooth" });
    }, 600 + i * STAGGER * 1000);
    timers.push(t);
  });

  book.onclick = (e) => {
    const cell = e.target.closest(".cell");
    if (cell) openBig(songs[+cell.dataset.i], faces[+cell.dataset.i], style);
  };
}

// one face, big, drawn at normal speed
let bigAnim = null;
function openBig(song, out, style) {
  $("#big").hidden = false;
  $("#big-title").innerHTML = `${shortTitle(song.title)}<small>${song.artist} · ${Math.round(out.audio.tempo)} BPM</small>${song.persona ? `<em>“${song.persona.summary}”</em>` : ""}`;
  bigAnim?.stop();
  bigAnim = animateDrawing($("#big-svg"), drawFace(out.face, style), style, { width: FRAME.width, height: FRAME.height, timing: out.audio });
}
function closeBig() {
  bigAnim?.stop();
  $("#big").hidden = true;
}
$("#close").onclick = closeBig;
document.addEventListener("keydown", (e) => e.key === "Escape" && closeBig());
