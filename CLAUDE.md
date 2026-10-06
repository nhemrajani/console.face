# console.face()

The project is called **console.face()** (a play on `console.log`). Never use the old name "Song Faces". Hidden feature: typing `console.face("song name")` in the browser console prints a text-art face for that song (`web/js/console-face.js`); keep it working as features change.

Turns music taste into art. A playlist defines **an artist** (a drawing style); each song becomes **a sitter**, a portrait of what that song would look like as a person, drawn in that style. The faces are sketched live, stroke by stroke, like watching someone draw in a sketchbook on a plain white page.

- **V1:** the user's own favourite songs. The drawing style is **derived from the music** (never hand-picked): the set of songs defines the artist.
- **V2:** anyone pastes a Spotify playlist link → the playlist's overall taste defines a unique art style → one face per song, animated as a sketchbook. Published on the user's portfolio, neeha.xyz.

## Data pipeline (song link → song profile)

```
Spotify track link ─► title + artist   (open.spotify.com/oembed, embed page; no auth)
                    ├► ReccoBeats      ─► tempo, key, mode, energy, valence, danceability, speechiness…
                    │                     (fallback: GetSongBPM, needs backlink; or librosa on a local audio file)
                    └► LRCLIB lyrics   ─► Claude ─► persona (summary, themes, sentiment, visual details)
                                                    ▼
                                           song profile JSON  ─►  face
Spotify playlist link ─► track list (open.spotify.com/embed/playlist/<id>, __NEXT_DATA__; no auth, undocumented)
```

Official Spotify Web API is also available: the user has Spotify Premium (required for dev apps since Feb 2026). Use client-credentials auth for public playlists/tracks; keys live in `.env` (git-ignored). Spotify-owned editorial/algorithmic playlists are blocked for new apps, so keep the embed-page route as a fallback.

Verified working 2026-10-05. See `samples/drew-a-picasso.json` for a real profile.

**Hard rules**
- **Lyrics are analysed, never stored, displayed, or committed.** Only the derived persona is kept.
- Spotify's own audio-features API is dead for new apps (Nov 2024). Don't build on it.
- No YouTube audio downloading (ToS; blocked on servers).
- Audio files in `audio/` are git-ignored.

**Lessons from the first test**
- Major/minor ≠ happy. Expression comes from **valence + lyric sentiment**, not mode.
- Tempo detectors often report double time (esp. rap). Use energy/danceability to decide when to halve BPM before mapping it to jitter/tilt.

## Rendering

- SVG. Every mark is a real path, so SVG export is exact; PNG is rasterised from it.
- Features sit on an invisible 3D head projected to 2D (yaw/pitch/roll, correct foreshortening).
- Hand-drawn strokes: noise-perturbed paths, overshoot, variable weight. Seeded randomness: same song + same style → same face.
- **Two separate parameter layers, from day one:**
  - **Style** (the artist, from the playlist): pen type, base line weight, jitter, hatching habit, proportions, how loose/confident, stroke order habits.
  - **Face** (the sitter, from the song): expression, hair, details, accessories, head pose.
- **Strokes are an ordered list** (construction lines → contours → features → hair → details → hatching) so they can be animated as live drawing.
- Plain white background (subtle paper grain optional).

## Mapping (one clearly commented config object, `web/mapping.js`)

Song → face: tempo → jitter + head tilt; energy/loudness → ink density; valence + sentiment → expression; persona themes → motifs/accessories (easy-to-extend tag → motif rules); persona details → specific features; speechiness/busyness → detail count.
Playlist → style (V2): aggregate stats (average + spread of tempo, energy, valence, genre mix, recurring themes) → style parameters.

## UI

Song picker with a large face, yaw/pitch/roll sliders, "turn slowly"; side panel explaining which inputs drove which choices; live mapping-strength sliders; sheet view (sketchbook grid with handwritten titles); PNG + SVG export; sketch-on animation.

## Milestones (show the user the result after each one)

**V1**
1. Doodle renderer: random faces that already look great; style vs face params split; ordered strokes
2. 3D head rotation
3. Sketch animation (strokes drawn live, sketchbook feel)
4. Song pipeline (Python): Spotify link → profile JSON (`songs.yaml` lists links; persona editable)
5. Wire the mapping + explanation panel + strength sliders
6. Sheet view + export

**V2**
7. Playlist → art style
8. Public "paste a playlist" version on neeha.xyz (static page + small serverless function holding API keys)

## Status

- Milestone 1 done (2026-10-05). Run with `python3 serve.py` (no-cache server, port 8123).
- Style has four music-driven dials: mess, cartoon, distort (Picasso), colour (riso accent, misregistered). Ink hue also from music. User wants it loose, messy, experimental, with dramatic differences.
- Sketch animation done (`web/js/animate.js`): artist-order drawing, parts start on beats, pen speed from tempo/energy, 9–20s per face.
- Song pipeline done: `pipeline/build_songs.py <playlist>` → `web/data/songs.json` (user's playlist "console.faces()", 25 songs, 21 with audio). ReccoBeats by Spotify ID, then title search fallback. Felt-tempo halving for rap/laid-back ≥115 BPM and strummed ≥160 BPM with low danceability.
- Personas for the 25 playlist songs were written by Claude in chat (marked `"source": "written by Claude in chat"` in songs.json) so the user can film a demo without an API key. The pipeline keeps existing personas on rerun. Automatic personas still need a Claude API key (none on this machine yet).
- Persona details → face via `DETAIL_RULES` in `web/js/songs.js` (looking up/down, eyes closed, big grin, glasses, hairstyles...).
- `index.html` is now the demo flow (start page with playlist box → loading lines → self-drawing sketchbook grid, `web/js/show.js`); the old tool lives at `lab.html`. `serve.py` exposes `/api/playlist?url=` (pipeline `build(..., reuse=True)`, ~0.3s for known songs). On a static host, show.js falls back to `data/songs.json` if the link matches.
- Lab presentation mode: press P or open `?present` (Esc exits); autoplays the playlist. Uses the `anthropic` SDK, claude-opus-5-5, effort low, structured JSON output, server-side fallbacks.
- Song → face mapping in `web/js/mapping.js` (`FACE_RULES`). Sketch view: song picker, per-song tempo, "play the playlist" autoplay. Sheet tab: all songs with handwritten titles.
- Next: lyric personas (needs key), head rotation, strength sliders, export.
- Known gap for M2: nose doesn't extend the head silhouette at strong yaw (|yaw| > ~0.6).

## Working notes

- The user is still learning Python: keep pipeline code readable, briefly explain key decisions in comments.
- Keep `README.md` current with setup and how to add songs.
- Web part stays plain static files, no build step (deploys to neeha.xyz).
- Local Python is 3.14; use a project venv (likely 3.12) if librosa/numba need it.
