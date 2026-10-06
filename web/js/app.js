import { deriveStyle, EXAMPLE_TASTES } from "./style.js";
import { randomFace, drawFace, FRAME } from "./face.js";

const SLIDERS = [
  ["tempo", "Tempo", 50, 190, 1, (v) => `${v} BPM`],
  ["energy", "Energy", 0, 1, 0.01],
  ["valence", "Mood (sad → happy)", 0, 1, 0.01],
  ["acousticness", "Acoustic", 0, 1, 0.01],
  ["danceability", "Danceable", 0, 1, 0.01],
  ["speechiness", "Rap / spoken", 0, 0.45, 0.01],
  ["variety", "Variety between songs", 0, 1, 0.01],
];

let presetName = "Drew A Picasso (real)";
let taste = { ...EXAMPLE_TASTES[presetName] };
let batch = 0;
let view = "one";

const $ = (s) => document.querySelector(s);

function buildControls() {
  const chips = $("#presets");
  for (const name of Object.keys(EXAMPLE_TASTES)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.onclick = () => {
      presetName = name;
      taste = { ...EXAMPLE_TASTES[name] };
      syncSliders();
      render();
    };
    chips.appendChild(b);
  }
  const box = $("#sliders");
  for (const [key, label, min, max, step, fmt] of SLIDERS) {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    wrap.innerHTML = `<label><span>${label}</span><span data-val="${key}"></span></label><input type="range" min="${min}" max="${max}" step="${step}" data-key="${key}">`;
    const input = wrap.querySelector("input");
    input.oninput = () => {
      taste[key] = parseFloat(input.value);
      presetName = null;
      syncSliders(false);
      scheduleRender();
    };
    box.appendChild(wrap);
  }
  $("#reroll").onclick = () => {
    batch++;
    render();
  };
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.onclick = () => {
      view = b.dataset.view;
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
      render();
    };
  });
  syncSliders();
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
  timer = setTimeout(render, 60);
}

function faceSVG(seed, style) {
  const face = randomFace(seed, style);
  const dr = drawFace(face, style);
  return dr.toSVG({ width: FRAME.width, height: FRAME.height });
}

function render() {
  const style = deriveStyle(taste);
  renderExplain(style);
  $("#grid").hidden = view !== "one";
  $("#compare").hidden = view !== "compare";
  if (view === "one") {
    const names = ["Ana", "Ben", "Cleo", "Dev", "Eli", "Fay"];
    $("#grid").innerHTML = names
      .map((n, i) => `<div class="face">${faceSVG(`${batch}-${i}`, style)}<div class="cap">sitter ${n}</div></div>`)
      .join("");
  } else {
    $("#compare").innerHTML = Object.entries(EXAMPLE_TASTES)
      .map(([name, t]) => {
        const st = deriveStyle(t);
        const cells = [0, 1, 2, 3].map((i) => `<div>${faceSVG(`${batch}-${i}`, st)}</div>`).join("");
        return `<div class="row"><div class="name">${name}<small>${st.pen}</small></div>${cells}</div>`;
      })
      .join("");
  }
}

function renderExplain(style) {
  $("#explain").innerHTML = style.explain
    .map(([k, v, why]) => {
      const sw = k === "Ink" ? `<span class="swatch" style="background:${v}"></span>` : "";
      return `<tr><td>${k}</td><td>${sw}<b>${v}</b><small>${why}</small></td></tr>`;
    })
    .join("");
}

buildControls();
render();
