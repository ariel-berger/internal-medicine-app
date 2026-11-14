"""
The email Gil gets for each new note in the Suggestion Box. Same look as the weekly email.
"""

from html import escape
from typing import Dict, Optional

from utils.weekly_digest_email import _page, _header, _button


def build_suggestion_email(content: str, author_name: Optional[str], author_email: Optional[str],
                           admin_url: str) -> Dict:
    if author_email:
        sender_html = f"From <strong>{escape(author_name or author_email)}</strong> ({escape(author_email)})."
        sender_text = f"From {author_name or author_email} ({author_email})."
        footer = "Reply to this email to answer them directly."
        # One line, whatever the name contains, so it can't break the email's headers
        subject = "Internal Nerds suggestion from " + " ".join((author_name or author_email).split())
    else:
        sender_html = sender_text = "Sent anonymously."
        footer = "This was sent anonymously, so there's no one to reply to."
        subject = "Internal Nerds: new anonymous suggestion"

    quote = escape(content).replace("\n", "<br>")
    inner = (
        _header("INTERNAL NERDS", "New suggestion", sender_html)
        + f"""
          <tr><td style="padding:8px 28px 4px;">
            <div style="border-left:3px solid #1d4ed8;background:#f8fafc;padding:12px 16px;font-size:15px;line-height:1.6;color:#0f172a;">{quote}</div>
          </td></tr>"""
        + _button(admin_url, "See all suggestions")
    )
    text = (
        "New suggestion on Internal Nerds\n\n"
        f"{sender_text}\n\n"
        f"{content}\n\n"
        f"See all suggestions: {admin_url}\n"
    )
    return {"subject": subject, "html": _page(inner, footer), "text": text}
