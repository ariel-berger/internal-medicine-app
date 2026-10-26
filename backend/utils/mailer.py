"""
Send HTML emails over the SMTP account configured in the environment.
"""

import os
import re
import smtplib
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from typing import Dict, List

logger = logging.getLogger(__name__)


def send_emails(messages: List[Dict]) -> int:
    """
    Send several emails over a single SMTP connection.

    Each message is a dict with: to, subject, html, text, and optional headers (dict).
    Returns the number of emails sent successfully.

    If EMAIL_OUTBOX_DIR is set, emails are written there as .html files instead of
    being sent (for local testing, so real users never get test emails).
    """
    if not messages:
        return 0

    outbox_dir = os.getenv('EMAIL_OUTBOX_DIR')
    if outbox_dir:
        os.makedirs(outbox_dir, exist_ok=True)
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        for i, message in enumerate(messages):
            safe_to = re.sub(r'[^A-Za-z0-9@._-]', '_', message['to'])
            path = os.path.join(outbox_dir, f"{stamp}-{i:03d}-{safe_to}.html")
            with open(path, 'w', encoding='utf-8') as f:
                f.write(f"<!-- To: {message['to']} | Subject: {message['subject']} -->\n{message['html']}")
        logger.info(f"Wrote {len(messages)} email(s) to {outbox_dir} instead of sending")
        return len(messages)

    smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_username = os.getenv('SMTP_USERNAME')
    smtp_password = os.getenv('SMTP_PASSWORD')
    if not smtp_username or not smtp_password:
        logger.warning("SMTP credentials not configured. Skipping %d email(s).", len(messages))
        return 0

    from_email = os.getenv('SMTP_FROM_EMAIL', smtp_username)
    if '<' not in from_email:
        from_email = formataddr(('Internal Nerds', from_email))

    sent = 0
    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            for message in messages:
                msg = MIMEMultipart('alternative')
                msg['Subject'] = message['subject']
                msg['From'] = from_email
                msg['To'] = message['to']
                for name, value in (message.get('headers') or {}).items():
                    msg[name] = value
                msg.attach(MIMEText(message['text'], 'plain', 'utf-8'))
                msg.attach(MIMEText(message['html'], 'html', 'utf-8'))
                try:
                    server.send_message(msg)
                    sent += 1
                except Exception as e:
                    logger.error(f"Failed to send email to {message['to']}: {e}")
    except Exception as e:
        logger.error(f"SMTP connection failed after {sent} email(s): {e}", exc_info=True)
    logger.info(f"Sent {sent}/{len(messages)} email(s)")
    return sent
