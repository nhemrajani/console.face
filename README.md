# console.face()

Turns music taste into art. The music decides **how** faces are drawn (the artist's pen, shaky or calm hand, shading, proportions), and each song becomes **a person** drawn in that style. Faces are sketchy ink doodles on a plain white page.

🚧 Work in progress. Done so far: the music-driven drawing style, and live sketching timed to the song.

Every portrait is generated entirely in JavaScript: no images, no AI image models.

## Run it

You need Python 3 (already on macOS).

```bash
python3 serve.py
```

Then open http://localhost:8123.

- **Sketch** watches a face being drawn live. The song sets the rhythm: each part of the face starts on a beat, slow songs draw in long unhurried lines, fast songs in scribbly bursts.
- **Sitters** shows six faces in the current style (click one to watch it drawn).
- **Compare tastes** shows the same four people drawn by eight different "artists".

### Filming a demo

Press **P** (or open http://localhost:8123/?present) for presentation mode: just the drawing, each song drawn after the other at its own tempo. **Esc** exits. To make it quicker, set the speed slider before pressing P.

### The hidden one

Open the browser console and type:

```js
console.face("Drew A Picasso")
```

It prints a little text-art face for that song, in the song's own ink colour. Songs without data yet get a consistent face guessed from the name.

## Your songs

The site reads `web/data/songs.json`, which the pipeline builds from a Spotify playlist:

```bash
python3 pipeline/build_songs.py "https://open.spotify.com/playlist/0VeR8rp0x0tIKIb2bqEFpP"
```

It reads the playlist (it must be public), looks up each song's tempo, energy and mood on ReccoBeats, fixes rap and slow songs that are detected at double tempo, averages everything into the playlist's **taste** (which defines the artist), and writes `songs.json`.

**To add or remove songs:** edit the playlist in Spotify, then run the command again. Songs ReccoBeats doesn't know use the playlist's average.

**Lyric personas (optional):** with a Claude API key, the pipeline also reads each song's lyrics from LRCLIB and asks Claude to describe the song as a person (expression, details like a tear or a gold chain). Only that description is kept; the lyrics are never saved.

```bash
pip install -r pipeline/requirements.txt
export ANTHROPIC_API_KEY=...   # never commit this
python3 pipeline/build_songs.py "<playlist link>"
```

Personas you already have are kept on later runs, so you can also edit them by hand in `songs.json`.

## How it's built

| File | What it does |
|---|---|
| `web/js/style.js` | **The artist.** Turns music taste (tempo, energy, mood…) into drawing habits: the four big dials (mess, cartoon, distortion, colour), the pen, and the ink colours. |
| `web/js/face.js` | **The sitter.** Builds a face (eyes, nose, hair, clothes…) on a 3D head and draws it in the artist's style. |
| `web/js/head.js` | The invisible 3D head and camera, so features foreshorten when the head turns. |
| `web/js/ink.js` | Hand-drawn strokes: wobble, shake, pressure, overshoot, re-traced lines, hatching. |
| `web/js/mask.js` | Finds clean outlines (head, hair) from the 3D shapes. |
| `web/js/animate.js` | Replays a drawing stroke by stroke, timed to the song's tempo and energy. |
| `web/js/console-face.js` | The `console.face()` easter egg: text-art faces in the browser console. |
| `web/js/songs.js` | Songs with real data (more arrive with the song pipeline). |
| `web/js/mapping.js` | **Song → face.** How each song's numbers pick its expression, hair, pose and accessories. `FACE_RULES` sets the strength of each rule. |
| `pipeline/build_songs.py` | Spotify playlist → `web/data/songs.json` (audio features, felt tempo, optional lyric persona). |
| `web/js/app.js` | The page: sketch view, sliders, grid, compare view. |
| `samples/` | Real song profiles (audio features + lyric persona; **never lyrics**). |

## Data rules

- Lyrics are analysed, never stored or shown. Only a short persona is kept.
- Audio files in `audio/` and API keys in `.env` are never committed.

## Roadmap

1. ✅ Music-driven doodle style (random faces)
2. ✅ Live sketch animation, timed to the song + `console.face()`
3. ✅ Song pipeline: Spotify playlist → audio features (+ lyric persona with an API key)
4. ✅ Song → face mapping + explanation panel (strength sliders still to come)
5. 3D head rotation: sliders + slow turn
6. Sketchbook sheet + PNG/SVG export
7. V2: Spotify playlist → its own art style
8. V2: public "paste a playlist" page on neeha.xyz
