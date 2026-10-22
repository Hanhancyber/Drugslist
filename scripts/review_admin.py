"""Local owner-only review moderation (never served through the website)."""
from pathlib import Path
import argparse
import json
import sqlite3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--db', type=Path, default=Path(__file__).resolve().parents[1] / 'runtime/members.sqlite3')
parser.add_argument('--delete-review', type=int, help='Delete a specified review ID after inspecting reports')
args = parser.parse_args()
if not args.db.exists():
    parser.error('Database does not exist; start the application first.')
with sqlite3.connect(args.db) as db:
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    if args.delete_review is not None:
        cursor = db.execute('DELETE FROM reviews WHERE id=?', (args.delete_review,))
        print(json.dumps({'deleted': cursor.rowcount}))
    else:
        rows = db.execute('''SELECT r.id AS review_id,r.drug_id,r.category,r.body,p.reason,p.created_at
            FROM reports p JOIN reviews r ON r.id=p.review_id ORDER BY p.created_at DESC''').fetchall()
        print(json.dumps([dict(r) for r in rows], ensure_ascii=False, indent=2))
