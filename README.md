# untitled

*(working title — name to be decided)*

Turns music taste into art. The music decides **how** faces are drawn (the artist's pen, shaky or calm hand, shading, proportions), and each song becomes **a person** drawn in that style. Faces are sketchy ink doodles on a plain white page.

🚧 Work in progress: currently at **Milestone 1** (the music-driven drawing style, with random faces).

Every portrait is generated entirely in JavaScript: no images, no AI image models.

## Run it

You need Python 3 (already on macOS).

```bash
python3 serve.py
```

Then open http://localhost:8123. Move the music sliders (or pick an example taste) and watch the drawing style change. **Compare tastes** shows the same four people drawn by seven different "artists".

## How it's built

| File | What it does |
|---|---|
| `web/js/style.js` | **The artist.** Turns music taste (tempo, energy, mood…) into drawing habits: the four big dials (mess, cartoon, distortion, colour), the pen, and the ink colours. |
| `web/js/face.js` | **The sitter.** Builds a face (eyes, nose, hair, clothes…) on a 3D head and draws it in the artist's style. |
| `web/js/head.js` | The invisible 3D head and camera, so features foreshorten when the head turns. |
| `web/js/ink.js` | Hand-drawn strokes: wobble, shake, pressure, overshoot, re-traced lines, hatching. |
| `web/js/mask.js` | Finds clean outlines (head, hair) from the 3D shapes. |
| `web/js/app.js` | The page: sliders, grid, compare view. |
| `samples/` | Real song profiles (audio features + lyric persona; **never lyrics**). |

## Data rules

- Lyrics are analysed, never stored or shown. Only a short persona is kept.
- Audio files in `audio/` and API keys in `.env` are never committed.

## Roadmap

1. ✅ Music-driven doodle style (random faces)
2. 3D head rotation: sliders + slow turn
3. Live sketch animation
4. Song pipeline: Spotify link → audio features + lyric persona
5. Song → face mapping, explanation panel, strength sliders
6. Sketchbook sheet + PNG/SVG export
7. V2: Spotify playlist → its own art style
8. V2: public "paste a playlist" page on neeha.xyz
