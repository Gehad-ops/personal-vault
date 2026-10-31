import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/signup":
            self.send_response(204)
            self.end_headers()
            return
        super().do_POST()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Personal Vault test page: http://localhost:{PORT}/")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
