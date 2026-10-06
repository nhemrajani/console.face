"""
Build web/data/songs.json from a Spotify playlist.

    python3 pipeline/build_songs.py "https://open.spotify.com/playlist/..."

What it does, step by step:
  1. Reads the playlist's track list from Spotify's public embed page.
  2. Looks up each track's audio features (tempo, energy, mood...) on ReccoBeats.
  3. Works out the "felt" tempo (many rap songs are detected at double speed).
  4. Optional: fetches the lyrics, asks Claude to describe the song as a person,
     and keeps ONLY that description. Lyrics are never saved anywhere.
     (Skipped unless the `anthropic` package and an API key are available.)
  5. Averages everything into the playlist's "taste", which defines the artist.
  6. Writes web/data/songs.json for the website to read.

Only the Python standard library is needed for steps 1-3, 5 and 6.
"""

import json
import os
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data" / "songs.json"
USER_AGENT = "Mozilla/5.0 (console.face pipeline)"


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def get(url):
    """Download a URL and return its text. Spotify's embed page needs a browser-like User-Agent."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


def get_json(url):
    return json.loads(get(url))


def spotify_id(link, kind):
    """Pull the ID out of a Spotify link, e.g. .../playlist/0VeR8rp0x0tIKIb2bqEFpP?si=... -> 0VeR8rp0x0tIKIb2bqEFpP"""
    match = re.search(rf"{kind}/([A-Za-z0-9]+)", link)
    if not match:
        sys.exit(f"That doesn't look like a Spotify {kind} link: {link}")
    return match.group(1)


# ---------------------------------------------------------------------------
# Step 1: the playlist's tracks
# ---------------------------------------------------------------------------

def read_playlist(playlist_id):
    """
    Spotify's embed player page contains the track list as JSON inside a
    <script id="__NEXT_DATA__"> tag. Reading it needs no account or API key.
    (It's undocumented, so if Spotify changes the page this is the step to fix;
    the official Web API with your Premium account is the backup route.)
    """
    html = get(f"https://open.spotify.com/embed/playlist/{playlist_id}")
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not match:
        sys.exit("Couldn't find the track list on Spotify's embed page. Is the playlist public?")
    entity = json.loads(match.group(1))["props"]["pageProps"]["state"]["data"]["entity"]
    tracks = []
    for t in entity["trackList"]:
        track_id = t["uri"].split(":")[-1]
        tracks.append({
            "id": track_id,
            "title": t["title"],
            "artist": t["subtitle"],
            "url": f"https://open.spotify.com/track/{track_id}",
            "duration_ms": t.get("duration"),
        })
    return {"name": entity["name"], "owner": entity.get("subtitle", ""), "tracks": tracks}


# ---------------------------------------------------------------------------
# Step 2: audio features
# ---------------------------------------------------------------------------

FEATURES = ["tempo", "energy", "valence", "acousticness", "danceability", "speechiness", "loudness", "key", "mode"]


def audio_features(track_ids):
    """
    ReccoBeats returns Spotify-style audio features for Spotify track IDs
    (Spotify stopped giving these to new apps in 2024). No key needed.
    We ask for up to 40 tracks per request to be polite.
    """
    found = {}
    for i in range(0, len(track_ids), 40):
        batch = track_ids[i:i + 40]
        data = get_json("https://api.reccobeats.com/v1/audio-features?ids=" + ",".join(batch))
        for item in data.get("content", []):
            # ReccoBeats tells us which Spotify track each result belongs to via its link
            sid = item["href"].rstrip("/").split("/")[-1]
            found[sid] = {k: item.get(k) for k in FEATURES}
        time.sleep(0.3)
    return found


def search_features(title, artist):
    """
    Fallback for tracks ReccoBeats doesn't know by their Spotify ID (often a
    remaster or a different release of the same song). We search by title and
    keep the first result whose artist matches.
    """
    clean_title = re.sub(r"\s*\(.*$|\s+-\s.*$", "", title).strip()
    main_artist = artist.split(",")[0].strip().lower()
    for page in range(4):
        query = urllib.parse.urlencode({"searchText": clean_title, "size": 50, "page": page})
        results = get_json(f"https://api.reccobeats.com/v1/track/search?{query}").get("content", [])
        for r in results:
            same_title = r["trackTitle"].lower().startswith(clean_title.lower())
            same_artist = any(main_artist in a["name"].lower() for a in r["artists"])
            if same_title and same_artist:
                f = get_json(f"https://api.reccobeats.com/v1/track/{r['id']}/audio-features")
                return {k: f.get(k) for k in FEATURES}
        if not results:
            break
        time.sleep(0.3)
    return None


# ---------------------------------------------------------------------------
# Step 3: felt tempo
# ---------------------------------------------------------------------------

def felt_tempo(f):
    """
    Beat detectors often count rap and slow R&B at double speed (they hear the
    hi-hats, not the groove). If a song is wordy or laid-back but reports a fast
    tempo, we halve it. This matters because tempo drives how shaky the lines are.
    """
    bpm = f["tempo"]
    rap = (f.get("speechiness") or 0) > 0.15
    laid_back = (f.get("energy") or 0) < 0.55
    # very fast but not very danceable usually means a mid-tempo song counted twice (e.g. Wonderwall)
    strummed = bpm >= 160 and (f.get("danceability") or 0) < 0.5
    if (bpm >= 115 and (rap or laid_back)) or strummed:
        return round(bpm / 2, 1)
    return round(bpm, 1)


# ---------------------------------------------------------------------------
# Step 4 (optional): lyrics -> persona
# ---------------------------------------------------------------------------

PERSONA_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "One sentence: who this song would be as a person."},
        "themes": {"type": "array", "items": {"type": "string"}, "description": "3-6 short theme tags, e.g. heartbreak, night, ocean, money."},
        "sentiment": {"type": "string", "description": "One word: happy, sad, bitter, bittersweet, hopeful, angry, playful, longing, confident..."},
        "details": {"type": "array", "items": {"type": "string"}, "description": "3-6 visual details for a portrait, e.g. averted gaze, half smirk, gold chain, tear, sunglasses, messy hair."},
    },
    "required": ["summary", "themes", "sentiment", "details"],
    "additionalProperties": False,
}


def fetch_lyrics(title, artist):
    """LRCLIB is a free, open lyrics service. We only hold the lyrics in memory for a moment."""
    main_artist = artist.split(",")[0].strip()
    clean_title = re.sub(r"\s*\(.*$|\s+-\s.*$", "", title).strip()  # drop "(feat. ...)" and " - Remastered"
    query = urllib.parse.urlencode({"artist_name": main_artist, "track_name": clean_title})
    try:
        return get_json(f"https://lrclib.net/api/get?{query}").get("plainLyrics")
    except Exception:
        return None


def make_persona(client, track):
    lyrics = fetch_lyrics(track["title"], track["artist"])
    if not lyrics:
        return None
    response = client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=2000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": PERSONA_SCHEMA}},
        # if a request is declined, the API retries it on a suitable fallback model
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system="You describe songs as if they were people, for a drawing tool that sketches each song as a portrait. "
               "Never quote the lyrics in your answer; describe the character, mood and look instead.",
        messages=[{"role": "user", "content": f'Song: "{track["title"]}" by {track["artist"]}\n\nLyrics:\n{lyrics}'}],
    )
    del lyrics  # the lyrics are discarded here; only the persona below is kept
    if response.stop_reason == "refusal":
        return None
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def persona_client():
    """Returns a Claude client if the `anthropic` package and credentials are set up, else None."""
    try:
        import anthropic
    except ImportError:
        print("  (skipping lyric personas: run `pip install anthropic` to enable them)")
        return None
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print("  (skipping lyric personas: no ANTHROPIC_API_KEY set)")
        return None
    return anthropic.Anthropic()


# ---------------------------------------------------------------------------
# Step 5: the playlist's taste (this is what defines the artist)
# ---------------------------------------------------------------------------

def playlist_taste(songs):
    """Averages of each feature, plus "variety": how different the songs are from each other."""
    with_audio = [s for s in songs if s["audio"]]
    avg = lambda key: round(statistics.mean(s["audio"][key] for s in with_audio), 3)
    tempos = [s["tempo_felt"] for s in with_audio]
    # variety = average spread (standard deviation) across the main features, scaled to roughly 0..1
    spreads = [
        statistics.pstdev([t / 180 for t in tempos]),
        *(statistics.pstdev([s["audio"][k] for s in with_audio]) for k in ["energy", "valence", "acousticness", "danceability"]),
    ]
    variety = min(1.0, statistics.mean(spreads) * 3.5)
    return {
        "tempo": round(statistics.mean(tempos), 1),
        "energy": avg("energy"),
        "valence": avg("valence"),
        "acousticness": avg("acousticness"),
        "danceability": avg("danceability"),
        "speechiness": avg("speechiness"),
        "variety": round(variety, 3),
    }


# ---------------------------------------------------------------------------
# Put it all together
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        sys.exit('Usage: python3 pipeline/build_songs.py "<spotify playlist link>"')
    link = sys.argv[1]

    print("1. Reading playlist...")
    playlist = read_playlist(spotify_id(link, "playlist"))
    tracks = playlist["tracks"]
    print(f"   {playlist['name']} by {playlist['owner']}: {len(tracks)} tracks")

    print("2. Fetching audio features from ReccoBeats...")
    features = audio_features([t["id"] for t in tracks])
    for t in tracks:
        if t["id"] not in features:
            found = search_features(t["title"], t["artist"])
            if found:
                features[t["id"]] = found
                print(f"   found {t['title']} by searching")
    missing = [t for t in tracks if t["id"] not in features]
    print(f"   audio data for {len(tracks) - len(missing)}/{len(tracks)} songs")
    for t in missing:
        print(f"   - none for {t['title']} ({t['artist']}): its face will use the playlist average")

    print("3. Working out felt tempo...")
    songs = []
    for t in tracks:
        f = features.get(t["id"])
        song = {**t, "audio": f, "tempo_felt": felt_tempo(f) if f else None, "persona": None}
        if f and song["tempo_felt"] != round(f["tempo"], 1):
            print(f"   {t['title']}: {f['tempo']:.0f} → {song['tempo_felt']:.0f} BPM (half-time)")
        songs.append(song)

    print("4. Lyric personas...")
    # keep personas you already have (and any you edited by hand) from the last run
    previous = {}
    if OUT.exists():
        previous = {s["id"]: s.get("persona") for s in json.loads(OUT.read_text()).get("songs", [])}
    client = persona_client()
    for song in songs:
        if previous.get(song["id"]):
            song["persona"] = previous[song["id"]]
        elif client:
            song["persona"] = make_persona(client, song)
            print(f"   {song['title']}: {song['persona']['summary'] if song['persona'] else '(no lyrics found)'}")

    print("5. Averaging the playlist's taste...")
    taste = playlist_taste(songs)
    print("   " + ", ".join(f"{k} {v}" for k, v in taste.items()))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "playlist": {"name": playlist["name"], "owner": playlist["owner"], "url": link.split("?")[0], "taste": taste},
        "songs": songs,
    }, indent=2, ensure_ascii=False))
    print(f"6. Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
