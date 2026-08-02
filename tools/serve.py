# serve.py — 带 charset=utf-8 的小静态服务器（替代 python -m http.server）
import http.server, socketserver, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
DIR = sys.argv[2] if len(sys.argv) > 2 else '.'

class UTF8Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 所有 .js / .json / .html 默认 utf-8
        path = self.path.split('?')[0]
        if path.endswith(('.js', '.json', '.html', '.css', '.svg', '.mjs')):
            ct = self.headers.get('Content-Type', '') or ''
            if 'charset' not in ct:
                self.headers['Content-Type'] = ct + ('; charset=utf-8' if ct else 'text/plain; charset=utf-8')
        # 也覆盖实际发送的 Content-Type
        super().end_headers()
        self.send_header('Connection', 'close')
    def guess_type(self, path):
        t = super().guess_type(path)
        if isinstance(t, str) and ('charset' not in t) and path.endswith(('.js','.json','.html','.css','.svg','.mjs')):
            t += '; charset=utf-8'
        return t

os.chdir(DIR)
class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True
with ThreadingTCPServer(('127.0.0.1', PORT), UTF8Handler) as httpd:
    print(f'Serving {DIR} at http://127.0.0.1:{PORT}')
    httpd.serve_forever()