# Song Faces

A generative art tool that turns songs into hand-drawn doodle faces: sketchy black ink on off-white paper, every face unique but clearly by the same artist. Each song's face is driven by its musical features and lyrical themes.

## Pipeline

1. **Analysis (Python, `analysis/`)** — `librosa` reads audio from `audio/` and extracts tempo (BPM), energy/RMS, spectral brightness, key + mode, onset density. Theme tags and sentiment come from `songs.yaml`, written by hand. **Never store or fetch lyrics.** Songs with no audio file can give manual BPM/key/energy in `songs.yaml`. Output: `songs.json` with features normalised to 0–1.
2. **Renderer (JavaScript, single HTML page)** — features sit on an invisible 3D head projected to 2D (yaw/pitch/roll, correct foreshortening). Every stroke is wobbly and hand-drawn (noise-perturbed paths, overshoot, variable weight) over a subtle paper texture. Seeded randomness: same song → same face.
3. **Mapping** — one clearly commented config object:
   - BPM → line jitter + head tilt
   - Energy → ink density (hatching, dark hair, line weight)
   - Major/minor → expression (mouth curve, eye openness)
   - Brightness → hair style/texture
   - Onset density → detail count (freckles, stubble, wrinkles)
   - Theme tags → motifs/accessories (easy to add new tag → motif rules)
   - Sentiment → overall expression bias
4. **UI** — song picker with large face, yaw/pitch/roll sliders, "turn slowly" animation; side panel explaining which features drove which choices; sheet view (sketchbook grid with handwritten titles); live mapping-strength sliders; PNG + SVG export for a face or the sheet.

## Milestones (show the user the result after each one)

1. Static renderer with random faces that already look good in the doodle style
2. 3D head rotation
3. Audio analysis → JSON
4. Wire the mapping
5. Sheet view + export

## Working notes

- The user is still learning Python: keep analysis code readable, and briefly explain key decisions in comments.
- Keep `README.md` current with setup steps and how to add new songs.
- `audio/` contents are git-ignored (copyrighted audio stays local).
