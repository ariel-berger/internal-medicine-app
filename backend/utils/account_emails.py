"""
Emails about someone's account: the "choose a new password" link and the admin/senior confirmation link.
Same look as the weekly email.
"""

from html import escape
from typing import Dict

from utils.weekly_digest_email import _page, _header, _button


def build_password_reset_email(reset_url: str, valid_hours: int) -> Dict:
    inner = (
        _header(
            "INTERNAL NERDS",
            "Choose a new password",
            f"Someone (hopefully you) asked to reset the password for this email address. "
            f"The link works for {valid_hours} hours and only once.",
        )
        + _button(reset_url, "Choose a new password")
    )
    footer = "Didn't ask for this? You can ignore this email; your password stays the same."
    text = (
        "Choose a new password for Internal Nerds\n\n"
        f"Open this link to choose a new password (it works for {valid_hours} hours and only once):\n"
        f"{reset_url}\n\n"
        "Didn't ask for this? You can ignore this email; your password stays the same.\n"
    )
    return {"subject": "Choose a new password for Internal Nerds", "html": _page(inner, footer), "text": text}


def build_confirm_email(confirm_url: str, access: str, valid_days: int) -> Dict:
    inner = (
        _header(
            "INTERNAL NERDS",
            "Confirm your email address",
            f"This address has <strong>{escape(access)}</strong> access on Internal Nerds. "
            f"Click below to confirm it's yours and turn that access on. You can already use the site in the meantime.",
        )
        + _button(confirm_url, "Confirm my email")
    )
    footer = (
        f"The link works for {valid_days} days. Didn't create an account? Ignore this email: "
        f"the {escape(access)} access stays off."
    )
    text = (
        "Confirm your email address for Internal Nerds\n\n"
        f"This address has {access} access. Open this link to confirm it's yours and turn that access on "
        f"(it works for {valid_days} days):\n{confirm_url}\n\n"
        f"Didn't create an account? Ignore this email: the {access} access stays off.\n"
    )
    return {"subject": "Confirm your email for Internal Nerds", "html": _page(inner, footer), "text": text}


def build_signup_limit_email(count: int, limit: int) -> Dict:
    inner = _header(
        "INTERNAL NERDS",
        "New sign-ups are paused for now",
        f"{count} new people joined in the last 24 hours, which reached the daily limit of {limit}. "
        "New people trying to sign up now see a message asking them to try again tomorrow. "
        "Everyone who already has an account can sign in as usual, and sign-ups reopen by themselves as the day passes.",
    )
    footer = "If this is expected (for example, you just shared the link widely), ask Claude to raise the limit."
    text = (
        "New sign-ups are paused for now\n\n"
        f"{count} new people joined in the last 24 hours, which reached the daily limit of {limit}. "
        "New people trying to sign up now are asked to try again tomorrow. Existing users can sign in as usual, "
        "and sign-ups reopen by themselves.\n\n"
        "If this is expected, ask Claude to raise the limit.\n"
    )
    return {"subject": "Internal Nerds: new sign-ups paused (daily limit reached)", "html": _page(inner, footer), "text": text}
