#!/usr/bin/env python3
"""開發用靜態伺服器：關閉快取，改完程式重新整理就一定拿到新版。"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5320


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只留錯誤，避免每個檔案都洗版
        if not args or not str(args[0]).startswith('GET'):
            super().log_message(fmt, *args)


# 多執行緒 + 較大的連線佇列：一次載入 8 位角色的 atlas 時，單執行緒伺服器會漏接請求
class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


with Server(("", PORT), NoCacheHandler) as httpd:
    print(f"serving on http://localhost:{PORT}")
    httpd.serve_forever()
