import { deriveStyle, EXAMPLE_TASTES } from "./style.js";
import { randomFace, drawFace, FRAME } from "./face.js";
import { animateDrawing } from "./animate.js";
import { findSong, applyPersona, loadPlaylist, PLAYLIST } from "./songs.js";
import { faceForSong } from "./mapping.js";
import { installConsoleFace } from "./console-face.js";

installConsoleFace();

const SLIDERS = [
  ["tempo", "Tempo", 50, 190, 1, (v) => `${Math.round(v)} BPM`],
  ["energy", "Energy", 0, 1, 0.01],
  ["valence", "Mood (sad → happy)", 0, 1, 0.01],
  ["acousticness", "Acoustic", 0, 1, 0.01],
  ["danceability", "Danceable", 0, 1, 0.01],
  ["speechiness", "Rap / spoken", 0, 0.45, 0.01],
  ["variety", "Variety between songs", 0, 1, 0.01],
];

const MINE = "My playlist";
let tastes = { ...EXAMPLE_TASTES };
let presetName = "Drew A Picasso (real)";
let taste = { ...tastes[presetName] };
let batch = 0;
let view = "sketch";
let sketchSeed = null; // a random sitter chosen from the grid
let songIndex = 0; // which playlist song the sketch shows
let anim = null;

const $ = (s) => document.querySelector(s);
const usingPlaylist = () => PLAYLIST && presetName === MINE;
const songs = () => PLAYLIST?.songs ?? [];

function buildControls() {
  const chips = $("#presets");
  chips.innerHTML = "";
  for (const name of Object.keys(tastes)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.onclick = () => {
      presetName = name;
      taste = { ...tastes[name] };
      sketchSeed = null;
      syncSliders();
      render();
    };
    chips.appendChild(b);
  }
  const box = $("#sliders");
  for (const [key, label, min, max, step] of SLIDERS) {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    wrap.innerHTML = `<label><span>${label}</span><span data-val="${key}"></span></label><input type="range" min="${min}" max="${max}" step="${step}" data-key="${key}">`;
    const input = wrap.querySelector("input");
    input.oninput = () => {
      taste[key] = parseFloat(input.value);
      if (!usingPlaylist()) presetName = null; // moving sliders on your playlist keeps its songs
      syncSliders(false);
      scheduleRender();
    };
    box.appendChild(wrap);
  }
  $("#reroll").onclick = () => {
    batch++;
    sketchSeed = `${batch}-0`;
    render();
  };
  $("#redraw").onclick = () => renderSketch();
  $("#speed").oninput = () => ($("#speed-val").textContent = $("#speed").value + "×");
  $("#speed").onchange = () => renderSketch();
  $("#song").onchange = () => {
    songIndex = parseInt($("#song").value, 10);
    sketchSeed = null;
    renderSketch();
  };
  document.querySelectorAll(".tabs button[data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $("#present").onclick = () => setPresent(true);
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === "p" || e.key === "P") setPresent(!document.body.classList.contains("present"));
    if (e.key === "Escape") setPresent(false);
  });
  $("#grid").onclick = (e) => {
    const cell = e.target.closest("[data-seed], [data-song]");
    if (!cell) return;
    if (cell.dataset.song) {
      songIndex = parseInt(cell.dataset.song, 10);
      sketchSeed = null;
    } else sketchSeed = cell.dataset.seed;
    setView("sketch");
  };
  syncSliders();
}

// Presentation mode for filming: just the drawing, playing through the playlist.
function setPresent(on) {
  document.body.classList.toggle("present", on);
  if (on) {
    $("#autoplay").checked = usingPlaylist();
    $("#wm-sub").textContent = usingPlaylist() ? `${PLAYLIST.playlist.name} · ${PLAYLIST.playlist.owner}` : "";
    setView("sketch");
  }
}

function setView(v) {
  view = v;
  document.querySelectorAll(".tabs button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
  render();
}

function syncSliders(setInputs = true) {
  for (const [key, , , , , fmt] of SLIDERS) {
    const v = taste[key];
    if (setInputs) document.querySelector(`input[data-key="${key}"]`).value = v;
    document.querySelector(`[data-val="${key}"]`).textContent = fmt ? fmt(v) : v.toFixed(2);
  }
  document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("active", b.textContent === presetName));
}

let timer = null;
function scheduleRender() {
  clearTimeout(timer);
  timer = setTimeout(render, view === "sketch" ? 250 : 60);
}

const svgOf = (dr) => dr.toSVG({ width: FRAME.width, height: FRAME.height });

function render() {
  const style = deriveStyle(taste);
  renderExplain(style);
  $("#sheet-tab").textContent = usingPlaylist() ? "Sheet" : "Sitters";
  $("#song").hidden = !usingPlaylist();
  $(".auto").hidden = !usingPlaylist();
  $("#sketch").hidden = view !== "sketch";
  $("#grid").hidden = view !== "one";
  $("#compare").hidden = view !== "compare";
  if (view !== "sketch") {
    anim?.stop();
    $("#song-why-box").hidden = true;
  }
  if (view === "sketch") renderSketch();
  else if (view === "one") {
    if (usingPlaylist()) {
      // the sketchbook page: every song in your playlist, by the same artist
      $("#grid").innerHTML = songs()
        .map((s, i) => `<div class="face" data-song="${i}" title="Watch it being drawn">${svgOf(drawFace(faceForSong(s, style, taste).face, style))}<div class="cap">${shortTitle(s.title)}<small>${s.artist.split(",")[0]}</small></div></div>`)
        .join("");
    } else {
      const names = ["Ana", "Ben", "Cleo", "Dev", "Eli", "Fay"];
      $("#grid").innerHTML = names.map((n, i) => `<div class="face" data-seed="${batch}-${i}" title="Watch it being drawn">${svgOf(drawFace(randomFace(`${batch}-${i}`, style), style))}<div class="cap">sitter ${n}</div></div>`).join("");
    }
  } else {
    $("#compare").innerHTML = Object.entries(tastes)
      .map(([name, t]) => {
        const st = deriveStyle(t);
        const cells = [0, 1, 2, 3].map((i) => `<div>${svgOf(drawFace(randomFace(`${batch}-${i}`, st), st))}</div>`).join("");
        return `<div class="row"><div class="name">${name}<small>${st.pen}</small></div>${cells}</div>`;
      })
      .join("");
  }
}

const shortTitle = (t) => t.replace(/\s*\(.*$|\s+-\s.*$/, ""); // drop "(feat. ...)" and " - Remastered"

// The live sketch: a face drawn stroke by stroke in time with the music.
function renderSketch() {
  anim?.stop();
  const style = deriveStyle(taste);
  let face, timing, label, why = null;
  if (usingPlaylist() && !sketchSeed) {
    const song = songs()[songIndex];
    const out = faceForSong(song, style, taste);
    face = out.face;
    timing = out.audio; // the song itself sets the rhythm
    why = out.why;
    label = `${shortTitle(song.title)}<small>${song.artist} · ${Math.round(out.audio.tempo)} BPM</small>`;
  } else if (presetName === "Drew A Picasso (real)" && !sketchSeed) {
    const song = findSong("Drew A Picasso");
    face = applyPersona(randomFace("song:drew a picasso", style), song.persona);
    label = `${song.title}<small>${song.artist} · ${Math.round(taste.tempo)} BPM</small>`;
  } else {
    face = randomFace(sketchSeed ?? `${batch}-0`, style);
    label = "";
  }
  $("#now").innerHTML = label;
  $("#bpm").textContent = `${Math.round((timing ?? taste).tempo)} BPM`;
  renderSongWhy(why);
  const metro = $("#metro");
  metro.style.background = style.accent;
  anim = animateDrawing($("#sketch-svg"), drawFace(face, style), style, {
    width: FRAME.width,
    height: FRAME.height,
    speed: parseFloat($("#speed").value),
    timing,
    onBeat: () => {
      metro.classList.remove("tick");
      void metro.offsetWidth; // restart the CSS pulse
      metro.classList.add("tick");
    },
    onDone: () => {
      // sketchbook mode: turn the page and draw the next song
      if (usingPlaylist() && $("#autoplay").checked && view === "sketch") {
        setTimeout(() => {
          if (!$("#autoplay").checked || view !== "sketch") return;
          songIndex = (songIndex + 1) % songs().length;
          $("#song").value = songIndex;
          renderSketch();
        }, 1800);
      }
    },
  });
}

function renderSongWhy(why) {
  $("#song-why-box").hidden = !why;
  if (why) $("#song-why").innerHTML = why.map(([k, v]) => `<div class="why"><b>${k}</b><span>${v}</span></div>`).join("");
}

function renderExplain(style) {
  const bar = (x) => `<span class="bar"><span style="width:${Math.round(x * 100)}%"></span></span>`;
  $("#artist").innerHTML =
    `<div class="pen">${style.pen}</div>` +
    `<div class="inks"><span class="swatch" style="background:${style.ink}"></span>ink <span class="swatch" style="background:${style.accent}"></span>${style.accentName}</div>` +
    style.dials.map(([k, v]) => `<div class="dial"><span>${k}</span>${bar(v)}<em>${Math.round(v * 100)}%</em></div>`).join("");
  $("#mapping").innerHTML = style.mapping
    .map((m) => `<div class="map"><div class="in"><b>${m.input}</b><em>${m.value}</em></div>${bar(m.level)}<div class="fx">${m.effects.map((e) => `<span>${e}</span>`).join("")}</div></div>`)
    .join("");
}

async function start() {
  const data = await loadPlaylist();
  if (data) {
    // your playlist becomes the first (and default) artist
    tastes = { [MINE]: data.playlist.taste, ...EXAMPLE_TASTES };
    presetName = MINE;
    taste = { ...data.playlist.taste };
    $("#song").innerHTML = data.songs.map((s, i) => `<option value="${i}">${shortTitle(s.title)} · ${s.artist.split(",")[0]}</option>`).join("");
    $(".hint").textContent = `"${data.playlist.name}" by ${data.playlist.owner}: ${data.songs.length} songs. The other examples are made-up tastes.`;
  }
  buildControls();
  render();
  if (new URLSearchParams(location.search).has("present")) setPresent(true);
}

start();
