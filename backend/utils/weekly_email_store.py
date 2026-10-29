"""
Weekly email subscribers and the record of each week's email.

Stored in the articles database (not app.db) so they survive server restarts.
Admins only ever see totals: nothing here exposes who has unsubscribed.
"""

import json
import re
import secrets
import sqlite3
import unicodedata
from datetime import datetime
from typing import Dict, List, Optional

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-']+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS email_subscribers (
            email TEXT PRIMARY KEY,                  -- lowercased
            weekly_digest INTEGER NOT NULL DEFAULT 1,
            unsubscribe_token TEXT UNIQUE NOT NULL,
            has_logged_in INTEGER NOT NULL DEFAULT 0,
            added_by_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS weekly_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_key TEXT UNIQUE NOT NULL,           -- date of the Saturday scan it covers: one email per scan
            status TEXT NOT NULL DEFAULT 'pending',  -- pending, sending, sent, skipped, expired
            created_at TEXT NOT NULL,                -- UTC
            articles_json TEXT,                      -- the articles that were sent: [{id, title, journal}]
            decided_by TEXT,
            decided_at TEXT,
            recipients_count INTEGER,
            send_error TEXT
        );
    """)
    conn.commit()


def _now() -> str:
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S')


def normalize_email(email: str) -> str:
    return (email or '').strip().lower()


# ---- Subscribers ----

def ensure_subscriber(conn: sqlite3.Connection, email: str, logged_in: bool = False, added_by_admin: bool = False) -> Optional[Dict]:
    """Add the address to the list (subscribed) if it isn't there yet. Never changes an existing on/off choice."""
    email = normalize_email(email)
    if not EMAIL_RE.fullmatch(email):
        return None
    now = _now()
    conn.execute(
        """INSERT OR IGNORE INTO email_subscribers
           (email, weekly_digest, unsubscribe_token, has_logged_in, added_by_admin, created_at, updated_at)
           VALUES (?, 1, ?, ?, ?, ?, ?)""",
        (email, secrets.token_urlsafe(24), int(logged_in), int(added_by_admin), now, now),
    )
    if logged_in:
        conn.execute("UPDATE email_subscribers SET has_logged_in = 1 WHERE email = ? AND has_logged_in = 0", (email,))
    conn.commit()
    return get_subscriber(conn, email)


def get_subscriber(conn: sqlite3.Connection, email: str) -> Optional[Dict]:
    row = conn.execute("SELECT * FROM email_subscribers WHERE email = ?", (normalize_email(email),)).fetchone()
    return _subscriber_dict(row)


def get_subscriber_by_token(conn: sqlite3.Connection, token: str) -> Optional[Dict]:
    if not token:
        return None
    row = conn.execute("SELECT * FROM email_subscribers WHERE unsubscribe_token = ?", (token,)).fetchone()
    return _subscriber_dict(row)


def set_subscribed(conn: sqlite3.Connection, email: str, subscribed: bool) -> None:
    conn.execute(
        "UPDATE email_subscribers SET weekly_digest = ?, updated_at = ? WHERE email = ?",
        (int(subscribed), _now(), normalize_email(email)),
    )
    conn.commit()


def subscribed(conn: sqlite3.Connection) -> List[Dict]:
    rows = conn.execute("SELECT * FROM email_subscribers WHERE weekly_digest = 1 ORDER BY email").fetchall()
    return [_subscriber_dict(r) for r in rows]


def add_emails_from_text(conn: sqlite3.Connection, text: str) -> Dict:
    """
    Add every address found in pasted text (one per line, commas, or "Name <email>").
    The result says how many were new, never whether an existing address is subscribed.
    """
    # Copying from Hebrew-language apps brings invisible direction marks (and zero-width spaces) along
    text = ''.join(ch for ch in (text or '') if unicodedata.category(ch) != 'Cf')
    found = []
    for match in EMAIL_RE.findall(text):
        email = normalize_email(match)
        if email not in found:
            found.append(email)
    invalid = [
        token for token in re.split(r"[\s,;<>()\"]+", text)
        if '@' in token and not EMAIL_RE.search(token)
    ]

    added = 0
    for email in found:
        if not get_subscriber(conn, email):
            ensure_subscriber(conn, email, added_by_admin=True)
            added += 1
    return {'added': added, 'already_on_list': len(found) - added, 'invalid': invalid}


def _subscriber_dict(row) -> Optional[Dict]:
    if row is None:
        return None
    return {
        'email': row['email'],
        'weekly_digest': bool(row['weekly_digest']),
        'unsubscribe_token': row['unsubscribe_token'],
        'has_logged_in': bool(row['has_logged_in']),
    }


# ---- Weekly emails ----

def create_digest(conn: sqlite3.Connection, week_key: str) -> Dict:
    """Raises sqlite3.IntegrityError if this week's email already exists."""
    cursor = conn.execute(
        "INSERT INTO weekly_emails (week_key, status, created_at) VALUES (?, 'pending', ?)",
        (week_key, _now()),
    )
    conn.commit()
    return get_digest(conn, cursor.lastrowid)


def get_digest(conn: sqlite3.Connection, digest_id: int) -> Optional[Dict]:
    return _digest_dict(conn.execute("SELECT * FROM weekly_emails WHERE id = ?", (digest_id,)).fetchone())


def get_digest_by_week(conn: sqlite3.Connection, week_key: str) -> Optional[Dict]:
    return _digest_dict(conn.execute("SELECT * FROM weekly_emails WHERE week_key = ?", (week_key,)).fetchone())


def current_digest(conn: sqlite3.Connection) -> Optional[Dict]:
    """The email waiting for approval (or being sent), if any."""
    row = conn.execute(
        "SELECT * FROM weekly_emails WHERE status IN ('pending', 'sending') ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    return _digest_dict(row)


def digest_history(conn: sqlite3.Connection, limit: int = 8) -> List[Dict]:
    rows = conn.execute(
        "SELECT * FROM weekly_emails WHERE status IN ('sent', 'skipped', 'expired') ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [_digest_dict(r) for r in rows]


def update_digest(conn: sqlite3.Connection, digest_id: int, only_if_status: Optional[str] = None, **fields) -> int:
    """Update fields; with only_if_status, only if the email is still in that status. Returns rows changed."""
    if 'articles' in fields:
        fields['articles_json'] = json.dumps(fields.pop('articles'))
    if fields.get('decided_at') is True:
        fields['decided_at'] = _now()
    if fields.get('created_at') is True:
        fields['created_at'] = _now()
    sets = ', '.join(f"{name} = ?" for name in fields)
    sql = f"UPDATE weekly_emails SET {sets} WHERE id = ?"
    params = list(fields.values()) + [digest_id]
    if only_if_status:
        sql += " AND status = ?"
        params.append(only_if_status)
    changed = conn.execute(sql, params).rowcount
    conn.commit()
    return changed


def expire_other_pending(conn: sqlite3.Connection, week_key: str) -> None:
    """Only the newest scan's email can be approved."""
    conn.execute(
        "UPDATE weekly_emails SET status = 'expired', decided_at = ? WHERE status = 'pending' AND week_key != ?",
        (_now(), week_key),
    )
    conn.commit()


def _digest_dict(row) -> Optional[Dict]:
    if row is None:
        return None
    return {
        'id': row['id'],
        'week_key': row['week_key'],
        'status': row['status'],
        'created_at': row['created_at'] + 'Z',
        'articles': json.loads(row['articles_json']) if row['articles_json'] else [],
        'decided_by': row['decided_by'],
        'decided_at': row['decided_at'] + 'Z' if row['decided_at'] else None,
        'recipients_count': row['recipients_count'],
        'send_error': row['send_error'],
    }
