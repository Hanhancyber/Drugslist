import http.cookiejar
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import create_server


class AppFlow(unittest.TestCase):
    def test_persistent_member_reviews_and_access_control(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'test.sqlite3'
            app = create_server(0, db)
            thread = threading.Thread(target=app.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{app.server_port}'
            clients = [urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())) for _ in range(3)]

            def request(client, path, method='GET', body=None, csrf=None, origin=None):
                headers = {'Content-Type': 'application/json', 'Origin': origin or base}
                if csrf:
                    headers['X-CSRF-Token'] = csrf
                req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                             headers=headers, method=method)
                try:
                    response = clients[client].open(req)
                except urllib.error.HTTPError as ex:
                    response = ex
                raw = response.read()
                try:
                    data = json.loads(raw)
                except ValueError:
                    data = raw.decode()
                return response.status, data, response.headers

            try:
                drug = sorted(app.drug_ids)[0]
                self.assertEqual(request(0, '/api/health')[0], 200)
                self.assertEqual(request(0, '/runtime/members.sqlite3')[0], 404)
                self.assertEqual(request(0, '/outputs/../server.py')[0], 404)
                self.assertEqual(request(0, '/api/auth/register', 'POST', {'username': 'unsafe', 'password': 'password123', 'display_name': 'Bad'}, origin='https://evil.example')[0], 403)
                body = {'username': 'member_one', 'password': 'testpassword123', 'display_name': '测试会员'}
                status, auth, headers = request(0, '/api/auth/register', 'POST', body)
                self.assertEqual(status, 201)
                self.assertIn('HttpOnly', headers['Set-Cookie'])
                self.assertIn('SameSite=Strict', headers['Set-Cookie'])
                csrf = auth['csrf']
                self.assertEqual(request(0, '/api/session')[1]['user']['display_name'], '测试会员')
                self.assertEqual(request(1, '/api/auth/register', 'POST', body)[0], 409)
                content = {'category': 'price', 'rating': 4, 'body': '规格为80mg，2026年购入。<script>alert(1)</script>'}
                self.assertEqual(request(1, f'/api/reviews/{drug}', 'POST', content)[0], 401)
                self.assertEqual(request(0, f'/api/reviews/{drug}', 'POST', content)[0], 403)
                self.assertEqual(request(0, f'/api/reviews/{drug}', 'POST', content, csrf)[0], 201)
                self.assertEqual(request(0, f'/api/reviews/{drug}', 'POST', content | {'rating': 9}, csrf)[0], 400)
                self.assertEqual(request(0, '/api/reviews/fake', 'POST', content, csrf)[0], 404)
                records = request(0, f'/api/reviews?drug_id={drug}')[1]
                self.assertTrue(records['reviews'][0]['is_own'])
                self.assertEqual(records['reviews'][0]['body'], content['body'])
                self.assertNotIn('user_id', records['reviews'][0])
                review_id = records['reviews'][0]['id']
                self.assertEqual(request(0, f'/api/reviews/{drug}', 'POST', content | {'body': '更新后的价格体验记录。'}, csrf)[0], 201)
                self.assertEqual(len(request(0, f'/api/reviews?drug_id={drug}')[1]['reviews']), 1)
                other = request(1, '/api/auth/register', 'POST', body | {'username': 'member_two'})[1]
                self.assertEqual(request(1, f'/api/reviews/{review_id}', 'DELETE', csrf=other['csrf'])[0], 403)
                self.assertEqual(request(1, f'/api/reviews/{review_id}/report', 'POST', {'reason': '核对价格来源'}, other['csrf'])[0], 200)
                self.assertEqual(request(2, '/api/auth/login', 'POST', {'username': 'member_one', 'password': 'wrongpassword'})[0], 401)
                self.assertEqual(request(0, '/api/auth/logout', 'POST', {}, csrf)[0], 200)
                self.assertIsNone(request(0, '/api/session')[1]['user'])
                self.assertEqual(request(0, f'/api/reviews/{drug}', 'POST', content, csrf)[0], 401)
                login = request(0, '/api/auth/login', 'POST', body)[1]
                self.assertNotEqual(login['csrf'], csrf)
                with sqlite3.connect(db) as connection:
                    stored = connection.execute('SELECT password_hash FROM users LIMIT 1').fetchone()[0]
                    self.assertNotIn(body['password'], stored)
                    self.assertEqual(connection.execute('SELECT count(*) FROM reports').fetchone()[0], 1)
                self.assertEqual(request(0, '/api/ai/ask', 'POST', {'question': '测试'})[0], 501)
            finally:
                app.shutdown(); app.server_close(); thread.join()

            # A fresh process/server instance reads the same persistent storage.
            again = create_server(0, db)
            with sqlite3.connect(db) as connection:
                self.assertEqual(connection.execute('SELECT count(*) FROM users').fetchone()[0], 2)
                self.assertEqual(connection.execute('SELECT body FROM reviews').fetchone()[0], '更新后的价格体验记录。')
            again.server_close()


if __name__ == '__main__':
    unittest.main()
