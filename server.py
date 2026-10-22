"""Local Drugs List application. Persistent accounts/reviews; standard library only."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
import argparse
import hashlib
import hmac
import json
import mimetypes
import re
import secrets
import sqlite3
import threading
import time

ROOT = Path(__file__).resolve().parent
COOKIE = 'drugslist_session'
SESSION_AGE = 14 * 86400
CATEGORIES = {'price', 'effect', 'other'}
LIMIT_LOCK = threading.Lock()
ATTEMPTS = {}


def connect(path):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def init_db(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY, drug_id TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id), category TEXT NOT NULL,
            rating INTEGER CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
            UNIQUE(drug_id,user_id,category));
        CREATE INDEX IF NOT EXISTS reviews_drug ON reviews(drug_id,updated_at);
        CREATE TABLE IF NOT EXISTS reports (
            review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
            created_at INTEGER NOT NULL, PRIMARY KEY(review_id,user_id));
        ''')


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000)
    return salt + ':' + digest.hex()


def password_matches(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(':')[0]), stored)


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class Handler(BaseHTTPRequestHandler):
    server_version = 'DrugsList/1.0'

    def log_message(self, fmt, *args):
        # No request bodies, passwords, cookies or query strings in logs.
        print(self.command, urlsplit(self.path).path, args[1] if len(args) > 1 else '', flush=True)

    def common_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")

    def send_json(self, status, payload, cookie=None):
        raw = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.common_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(raw)

    def session(self, db):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            token = cookie[COOKIE].value if COOKIE in cookie else ''
        except Exception:
            token = ''
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            return None
        return db.execute('''SELECT s.*,u.username,u.display_name FROM sessions s
            JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?''',
            (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()

    def require_user(self, db):
        s = self.session(db)
        if not s:
            raise APIError(401, '请先登录会员账号。')
        if self.command != 'GET' and not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), s['csrf']):
            raise APIError(403, '会话校验失败，请刷新页面后重试。')
        return s

    def new_session(self, db, user_id):
        old = self.session(db)
        if old:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (old['token_hash'],))
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires_at<=?', (int(time.time()),))
        db.execute('INSERT INTO sessions VALUES (?,?,?,?)',
                   (hashlib.sha256(token.encode()).hexdigest(), user_id, csrf, int(time.time()) + SESSION_AGE))
        user = db.execute('SELECT id,username,display_name FROM users WHERE id=?', (user_id,)).fetchone()
        cookie = f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_AGE}'
        return {'user': dict(user), 'csrf': csrf}, cookie

    def request_body(self):
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise APIError(415, '请求格式应为JSON。')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise APIError(400, '请求长度不正确。')
        if length < 1 or length > 16384:
            raise APIError(413, '请求内容过长或为空。')
        try:
            body = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            raise APIError(400, '请求格式不正确。')
        if not isinstance(body, dict):
            raise APIError(400, '请求格式不正确。')
        return body

    def throttle(self, name, limit, seconds=900):
        key = (self.client_address[0], name)
        with LIMIT_LOCK:
            now = time.monotonic()
            times = [t for t in ATTEMPTS.get(key, []) if now - t < seconds]
            if len(times) >= limit:
                raise APIError(429, '尝试次数较多，请稍后再试。')
            ATTEMPTS[key] = times + [now]

    def check_origin(self):
        host = self.headers.get('Host', '')
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if host not in allowed:
            raise APIError(403, '此本地服务仅接受本机域名。')
        if self.command != 'GET' and self.headers.get('Origin') != f'http://{host}':
            raise APIError(403, '请求来源不匹配。')

    def handle_request(self):
        try:
            self.check_origin()
            path = urlsplit(self.path).path
            if not path.startswith('/api/'):
                if self.command != 'GET':
                    raise APIError(405, '不支持该请求。')
                return self.static_file(path)
            with connect(self.server.db_path) as db:
                result, status, cookie = self.api(db, path)
            self.send_json(status, result, cookie)
        except APIError as ex:
            self.send_json(ex.status, {'error': ex.message})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as ex:
            print('Application error:', type(ex).__name__, flush=True)
            self.send_json(500, {'error': '服务暂时不可用，请稍后重试。'})

    do_GET = handle_request
    do_POST = handle_request
    do_DELETE = handle_request

    def api(self, db, path):
        method = self.command
        if method == 'GET' and path == '/api/health':
            return {'ok': True, 'storage': 'sqlite', 'ai_connected': False}, 200, None
        if method == 'GET' and path == '/api/session':
            s = self.session(db)
            return {'user': {'id': s['user_id'], 'username': s['username'], 'display_name': s['display_name']} if s else None,
                    'csrf': s['csrf'] if s else None}, 200, None
        if method == 'POST' and path in ['/api/auth/register', '/api/auth/login']:
            self.throttle('auth', 30)
            body = self.request_body()
            username = str(body.get('username', '')).strip().lower()
            password = body.get('password', '')
            if not isinstance(password, str) or not re.fullmatch(r'[a-z0-9_]{3,32}', username) or not 8 <= len(password) <= 128:
                raise APIError(400, '账号须为3–32位字母、数字或下划线；密码须为8–128位。')
            if path.endswith('/register'):
                self.throttle('register', 10, 3600)
                display = str(body.get('display_name', '')).strip()
                if not 1 <= len(display) <= 30 or any(ord(c) < 32 for c in display):
                    raise APIError(400, '请填写1–30字昵称。')
                try:
                    cursor = db.execute('INSERT INTO users(username,display_name,password_hash,created_at) VALUES (?,?,?,?)',
                                        (username, display, password_hash(password), int(time.time())))
                except sqlite3.IntegrityError:
                    raise APIError(409, '此账号已被注册，请更换账号或登录。')
                payload, cookie = self.new_session(db, cursor.lastrowid)
                return payload, 201, cookie
            user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
            stored = user['password_hash'] if user else self.server.dummy_password
            valid = password_matches(password, stored)
            if not user or not valid:
                raise APIError(401, '账号或密码不正确。')
            payload, cookie = self.new_session(db, user['id'])
            return payload, 200, cookie
        if method == 'POST' and path == '/api/auth/logout':
            s = self.require_user(db)
            db.execute('DELETE FROM sessions WHERE token_hash=?', (s['token_hash'],))
            return {'ok': True}, 200, f'{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
        if method == 'GET' and path == '/api/reviews':
            drug_id = parse_qs(urlsplit(self.path).query).get('drug_id', [''])[0]
            if drug_id not in self.server.drug_ids:
                raise APIError(404, '未找到该药品。')
            s = self.session(db)
            rows = db.execute('''SELECT r.*,u.display_name FROM reviews r JOIN users u ON u.id=r.user_id
                WHERE drug_id=? ORDER BY updated_at DESC,id DESC LIMIT 100''', (drug_id,)).fetchall()
            reviews = [{k: r[k] for k in ['id', 'category', 'rating', 'body', 'created_at', 'updated_at', 'display_name']} |
                       {'is_own': bool(s and s['user_id'] == r['user_id'])} for r in rows]
            summary = [dict(r) for r in db.execute('''SELECT category,count(*) AS count,round(avg(rating),1) AS average
                FROM reviews WHERE drug_id=? GROUP BY category''', (drug_id,))]
            return {'reviews': reviews, 'summary': summary, 'limit': 100}, 200, None
        if method == 'POST' and path.startswith('/api/reviews/') and path.endswith('/report'):
            s = self.require_user(db)
            self.throttle('reports', 20, 3600)
            try:
                rid = int(path.split('/')[3])
            except ValueError:
                raise APIError(404, '评价不存在。')
            row = db.execute('SELECT id FROM reviews WHERE id=?', (rid,)).fetchone()
            if not row:
                raise APIError(404, '评价不存在。')
            reason = str(self.request_body().get('reason', '需要核查')).strip()
            if not 2 <= len(reason) <= 200:
                raise APIError(400, '举报原因须为2–200字。')
            db.execute('INSERT OR REPLACE INTO reports VALUES (?,?,?,?)', (rid, s['user_id'], reason, int(time.time())))
            return {'ok': True}, 200, None
        if method == 'POST' and path.startswith('/api/reviews/'):
            s = self.require_user(db)
            self.throttle('reviews', 20, 3600)
            drug_id = path.split('/')[-1]
            if drug_id not in self.server.drug_ids:
                raise APIError(404, '未找到该药品。')
            body = self.request_body()
            category, rating, text = body.get('category'), body.get('rating'), body.get('body')
            if category not in CATEGORIES or (rating is not None and (type(rating) is not int or not 1 <= rating <= 5)):
                raise APIError(400, '请选择评价类别和1–5星评分，评分也可留空。')
            if not isinstance(text, str) or not 5 <= len(text.strip()) <= 2000:
                raise APIError(400, '留言须为5–2000字。')
            now = int(time.time())
            db.execute('''INSERT INTO reviews(drug_id,user_id,category,rating,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(drug_id,user_id,category) DO UPDATE SET rating=excluded.rating,body=excluded.body,updated_at=excluded.updated_at''',
                (drug_id, s['user_id'], category, rating, text.strip(), now, now))
            return {'ok': True}, 201, None
        if method == 'DELETE' and path.startswith('/api/reviews/'):
            s = self.require_user(db)
            try:
                rid = int(path.split('/')[-1])
            except ValueError:
                raise APIError(404, '评价不存在。')
            row = db.execute('SELECT user_id FROM reviews WHERE id=?', (rid,)).fetchone()
            if not row:
                raise APIError(404, '评价不存在。')
            if row['user_id'] != s['user_id']:
                raise APIError(403, '只能删除自己的评价。')
            db.execute('DELETE FROM reviews WHERE id=?', (rid,))
            return {'ok': True}, 200, None
        if method == 'POST' and path == '/api/ai/ask':
            return {'error': 'AI问答尚未接入模型。', 'code': 'AI_NOT_CONFIGURED'}, 501, None
        raise APIError(404, '接口不存在。')

    def static_file(self, path):
        if path == '/':
            path = '/outputs/Drugs-List.html'
        relative = Path(unquote(path).lstrip('/'))
        allowed_data = {'drugs.json', 'drugs.csv', 'prices.csv', 'prices.json', 'indications.csv', 'sources.csv',
                        'coverage-by-year.csv', 'field-completeness.csv', 'statistics.json', 'label-gaps.csv'}
        allowed = (relative.parts and relative.parts[0] in {'outputs', 'assets'}) or str(relative) == 'README.md' or (
            len(relative.parts) == 2 and relative.parts[0] == 'data' and relative.name in allowed_data)
        file = (ROOT / relative).resolve()
        if not allowed or not file.is_relative_to(ROOT) or not file.is_file() or any(p.startswith('.') for p in relative.parts):
            raise APIError(404, '文件不存在。')
        raw = file.read_bytes()
        self.send_response(200)
        self.common_headers()
        self.send_header('Content-Type', (mimetypes.guess_type(file.name)[0] or 'application/octet-stream') +
                         ('; charset=utf-8' if file.suffix in {'.html', '.js', '.css', '.json', '.md', '.csv'} else ''))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def create_server(port=8774, db_path=None):
    db_path = Path(db_path or ROOT / 'runtime' / 'members.sqlite3')
    init_db(db_path)
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.db_path = db_path
    server.drug_ids = {d['drug_id'] for d in json.loads((ROOT / 'data/drugs.json').read_text())}
    server.dummy_password = password_hash(secrets.token_urlsafe(24))
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8774)
    parser.add_argument('--db', type=Path)
    args = parser.parse_args()
    app = create_server(args.port, args.db)
    print(f'Drugs List: http://127.0.0.1:{app.server_port}/outputs/Drugs-List.html', flush=True)
    try:
        app.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.server_close()
