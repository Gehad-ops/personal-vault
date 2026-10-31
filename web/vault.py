import http.server
import os
import socketserver
import sys
import threading
import webbrowser

PORT = 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        if "--no-open" not in sys.argv:
            threading.Timer(0.6, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}/")).start()
        print(f"Personal Vault is running at http://127.0.0.1:{PORT}/")
        print("Close this window to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
