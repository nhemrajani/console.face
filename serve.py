"""Serve the web page at http://localhost:8123 with caching turned off,
so the browser always shows your latest edits.  Run:  python3 serve.py"""
import functools
import http.server

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

handler = functools.partial(NoCache, directory="web")
print("Song Faces → http://localhost:8123")
http.server.ThreadingHTTPServer(("", 8123), handler).serve_forever()
