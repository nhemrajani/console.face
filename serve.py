"""Run the site locally:  python3 serve.py   ->   http://localhost:8123

- Serves the web/ folder with caching turned off, so you always see your latest edits.
- Also answers /api/playlist?url=<spotify playlist link> by running the same
  pipeline as pipeline/build_songs.py, so the start page works for any public
  playlist. (On a real website this part becomes a small serverless function.)
"""
import functools
import http.server
import importlib.util
import json
import threading
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# load pipeline/build_songs.py as a module so we can call its build() function
spec = importlib.util.spec_from_file_location("build_songs", ROOT / "pipeline" / "build_songs.py")
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)

cache = {}  # playlist link -> result, so a second visit is instant
lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/api/playlist":
            return self.playlist(urllib.parse.parse_qs(url.query).get("url", [""])[0])
        return super().do_GET()

    def playlist(self, link):
        key = link.split("?")[0]
        try:
            with lock:
                if key not in cache:
                    # personas from Claude are slow, so the live page skips them;
                    # songs that already have one in songs.json keep it
                    cache[key] = pipeline.build(link, use_claude=False, log=lambda *_: None, reuse=True)
            body, status = cache[key], 200
        except ValueError as e:
            body, status = {"error": str(e)}, 400
        except Exception as e:  # network trouble etc.
            body, status = {"error": f"Something went wrong reading that playlist ({type(e).__name__})."}, 502
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


handler = functools.partial(Handler, directory=str(ROOT / "web"))
print("Running → http://localhost:8123")
http.server.ThreadingHTTPServer(("", 8123), handler).serve_forever()
