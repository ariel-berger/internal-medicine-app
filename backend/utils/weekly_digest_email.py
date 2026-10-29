"""
Templates for the weekly "top 3 articles" email and the admin approval email.
"""

from html import escape
from typing import Dict, List

FONT = "Arial, Helvetica, sans-serif"


def _page(inner_rows: str, footer_html: str) -> str:
    return f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;font-family:{FONT};">
          {inner_rows}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:{FONT};">
          <tr><td style="padding:16px 8px;font-size:12px;line-height:1.6;color:#64748b;">{footer_html}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def _header(kicker: str, title: str, intro_html: str) -> str:
    return f"""
          <tr><td style="padding:28px 28px 8px;">
            <div style="font-size:12px;font-weight:bold;letter-spacing:0.06em;color:#1d4ed8;">{kicker}</div>
            <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#0f172a;">{title}</h1>
            <p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#334155;">{intro_html}</p>
          </td></tr>"""


def _button(url: str, label: str) -> str:
    return f"""
          <tr><td style="padding:12px 28px 28px;">
            <a href="{escape(url, quote=True)}" style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:8px;">{label}</a>
          </td></tr>"""


def _numbered_articles(articles: List[Dict]) -> str:
    rows = ""
    for i, article in enumerate(articles, 1):
        rows += f"""
          <tr><td style="padding:10px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
              <td valign="top" style="width:30px;font-size:18px;font-weight:bold;color:#1d4ed8;">{i}</td>
              <td valign="top">
                <div style="font-size:16px;font-weight:bold;line-height:1.35;color:#0f172a;">{escape(article.get('title') or 'Untitled')}</div>
                <div style="margin-top:4px;font-size:14px;color:#64748b;">{escape(article.get('journal') or '')}</div>
              </td>
            </tr></table>
          </td></tr>"""
    return rows


def build_digest_email(articles: List[Dict], recipient_email: str, dashboard_url: str, unsubscribe_url: str,
                       has_account: bool = True) -> Dict:
    """The email subscribers receive: top articles (title + journal) and a link to the dashboard.
    has_account=False is for addresses an admin added to the list, who may never have logged in."""
    count = len(articles)
    title = f"This week's top {count} articles" if count != 1 else "This week's top article"
    intro = "Here's what to read first from this week's update. Summaries and links are on the dashboard."

    rows = _header("INTERNAL NERDS", title, intro) + _numbered_articles(articles) + _button(dashboard_url, "Open the dashboard")

    if has_account:
        why = (f"You're getting this because you have an Internal Nerds account. It goes automatically to your "
               f"login email ({recipient_email}), once a week, after the Saturday article update.")
        settings = "or change it anytime under \"Email notification settings\" at the top of the site."
    else:
        why = (f"You're getting this because you were added to the Internal Nerds weekly email list. "
               f"It goes to {recipient_email} once a week, after the Saturday article update.")
        settings = "or, once you log in, change it anytime under \"Email notification settings\" at the top of the site."
    footer = (
        f"{escape(why)}<br>"
        f"Don't want it? <a href=\"{escape(unsubscribe_url, quote=True)}\" style=\"color:#475569;\">Unsubscribe with one click</a>, "
        f"{escape(settings)}"
    )

    text = f"{title}\n\n{intro}\n\n"
    for i, article in enumerate(articles, 1):
        text += f"{i}. {article.get('title') or 'Untitled'}\n   {article.get('journal') or ''}\n\n"
    text += (
        f"Open the dashboard: {dashboard_url}\n\n"
        f"---\n{why}\n"
        f"Unsubscribe with one click: {unsubscribe_url}\n"
        f"{settings[0].upper()}{settings[1:]}\n"
    )

    return {'subject': title, 'html': _page(rows, footer), 'text': text}


def build_approval_email(suggested: List[Dict], all_articles: List[Dict], recipients_count: int, review_url: str) -> Dict:
    """The email admins get after the Saturday scan: the suggested top 3 plus every article from the week."""
    subject = f"Please approve: this week's top {len(suggested)} email to {recipients_count} people"
    intro = (
        f"Nothing is sent until an admin approves. Once approved, it goes to <strong>{recipients_count} people</strong> "
        f"(everyone on the list who hasn't unsubscribed). To choose different articles, open the review page and tick the ones you want."
    )

    rows = _header("INTERNAL NERDS · ADMIN", "This week's email is waiting for your approval", intro)
    rows += _button(review_url, "Review, change and send")
    rows += """
          <tr><td style="padding:0 28px;"><h2 style="margin:0;font-size:16px;color:#0f172a;border-top:1px solid #e2e8f0;padding-top:20px;">Suggested top 3 (what users will see)</h2></td></tr>"""
    rows += _numbered_articles(suggested)

    suggested_ids = {a['id'] for a in suggested}
    table_rows = ""
    for article in all_articles:
        tags = ""
        if article['id'] in suggested_ids:
            tags += ' <span style="font-size:11px;font-weight:bold;color:#1d4ed8;background:#dbeafe;border-radius:4px;padding:1px 6px;">SUGGESTED</span>'
        if article.get('is_key_study'):
            tags += ' <span style="font-size:11px;font-weight:bold;color:#92400e;background:#fef3c7;border-radius:4px;padding:1px 6px;">KEY STUDY</span>'
        score = article.get('ranking_score')
        score_text = f"{score:g}" if isinstance(score, (int, float)) else "–"
        table_rows += f"""
              <tr>
                <td valign="top" style="padding:8px 8px 8px 0;border-top:1px solid #f1f5f9;font-size:14px;font-weight:bold;color:#334155;width:36px;">{score_text}</td>
                <td valign="top" style="padding:8px 0;border-top:1px solid #f1f5f9;">
                  <div style="font-size:14px;line-height:1.35;color:#0f172a;">{escape(article.get('title') or 'Untitled')}{tags}</div>
                  <div style="margin-top:2px;font-size:13px;color:#64748b;">{escape(article.get('journal') or '')}</div>
                </td>
              </tr>"""
    rows += f"""
          <tr><td style="padding:16px 28px 8px;">
            <h2 style="margin:0;font-size:16px;color:#0f172a;border-top:1px solid #e2e8f0;padding-top:20px;">All articles from this week ({len(all_articles)})</h2>
            <p style="margin:6px 0 0;font-size:13px;color:#64748b;">Same order as the dashboard: key studies first, then by score. Case reports and hidden articles are left out.</p>
          </td></tr>
          <tr><td style="padding:0 28px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="padding:6px 8px 6px 0;font-size:11px;font-weight:bold;color:#94a3b8;">SCORE</td><td style="padding:6px 0;font-size:11px;font-weight:bold;color:#94a3b8;">ARTICLE</td></tr>
              {table_rows}
            </table>
          </td></tr>"""
    rows += _button(review_url, "Review, change and send")

    footer = "You get this because you approve the Internal Nerds weekly email. Nobody gets it until an admin approves it."

    text = (
        f"This week's email is waiting for your approval.\n\n"
        f"Nothing is sent until an admin approves. Once approved, it goes to {recipients_count} people.\n"
        f"Review, change and send: {review_url}\n\n"
        f"Suggested top 3:\n"
    )
    for i, article in enumerate(suggested, 1):
        text += f"{i}. {article.get('title') or 'Untitled'} ({article.get('journal') or ''})\n"
    text += f"\nAll articles from this week ({len(all_articles)}):\n"
    for article in all_articles:
        score = article.get('ranking_score')
        score_text = f"{score:g}" if isinstance(score, (int, float)) else "-"
        text += f"[{score_text}] {article.get('title') or 'Untitled'} ({article.get('journal') or ''})\n"

    return {'subject': subject, 'html': _page(rows, footer), 'text': text}
