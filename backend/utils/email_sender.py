"""
Email sending utility for sending summary emails.
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict

logger = logging.getLogger(__name__)


def send_summary_email(
    to_email: str,
    subject: str,
    summary_data: Dict,
    start_date: str,
    end_date: str
) -> bool:
    """
    Send a summary email to the admin who initiated the article fetch.
    
    Args:
        to_email: Email address of the recipient
        subject: Email subject line
        summary_data: Dictionary containing summary statistics
        start_date: Start date of the processing
        end_date: End date of the processing
    
    Returns:
        True if email was sent successfully, False otherwise
    """
    try:
        # Get SMTP configuration from environment variables
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        smtp_username = os.getenv('SMTP_USERNAME')
        smtp_password = os.getenv('SMTP_PASSWORD')
        from_email = os.getenv('SMTP_FROM_EMAIL', smtp_username)
        
        # If SMTP credentials are not configured, log and skip
        if not smtp_username or not smtp_password:
            logger.warning(
                "SMTP credentials not configured. Skipping email notification. "
                "Set SMTP_USERNAME, SMTP_PASSWORD, and optionally SMTP_SERVER, SMTP_PORT, SMTP_FROM_EMAIL"
            )
            return False
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = from_email
        msg['To'] = to_email
        
        # Build email body
        success = summary_data.get('success', False)
        articles_collected = summary_data.get('articles_collected', 0)
        articles_classified = summary_data.get('articles_classified', 0)
        articles_stored = summary_data.get('articles_stored', 0)
        error = summary_data.get('error')
        processing_time = summary_data.get('processing_time_seconds', 0)
        statistics = summary_data.get('statistics', {})
        filtering_stats = summary_data.get('filtering_stats', {})
        
        # Format processing time
        if processing_time:
            if processing_time < 60:
                time_str = f"{int(processing_time)} seconds"
            elif processing_time < 3600:
                minutes = int(processing_time // 60)
                seconds = int(processing_time % 60)
                time_str = f"{minutes}m {seconds}s"
            else:
                hours = int(processing_time // 3600)
                minutes = int((processing_time % 3600) // 60)
                time_str = f"{hours}h {minutes}m"
        else:
            time_str = "N/A"
        
        # Extract statistics
        avg_score = statistics.get('avg_ranking_score', 0)
        articles_score_8_plus = statistics.get('articles_score_8_plus', 0)
        category_breakdown = statistics.get('category_breakdown', {})
        top_articles = statistics.get('top_articles', [])
        
        # Build category breakdown HTML
        category_html = ""
        if category_breakdown:
            category_items = sorted(category_breakdown.items(), key=lambda x: x[1], reverse=True)
            category_html = "<ul style='list-style: none; padding: 0; margin: 10px 0;'>"
            for category, count in category_items[:10]:  # Top 10 categories
                category_html += f"<li style='margin: 5px 0;'>{category}: <strong>{count}</strong></li>"
            category_html += "</ul>"
        else:
            category_html = "<p style='margin: 10px 0; color: #6b7280;'>No categories available</p>"
        
        # Build top articles HTML
        top_articles_html = ""
        if top_articles:
            top_articles_html = "<ul style='list-style: none; padding: 0; margin: 10px 0;'>"
            for i, article in enumerate(top_articles, 1):
                title = article.get('title', 'Untitled')
                score = article.get('score', 0)
                journal = article.get('journal', 'Unknown')
                top_articles_html += f"""
                <li style='margin: 8px 0; padding: 8px; background-color: #f8f9fa; border-radius: 4px;'>
                  <strong>#{i}</strong> <span style='color: #10b981; font-weight: bold;'>(Score: {score})</span><br>
                  <span style='font-size: 0.9em;'>{title}</span><br>
                  <span style='font-size: 0.85em; color: #6b7280;'>{journal}</span>
                </li>
                """
            top_articles_html += "</ul>"
        else:
            top_articles_html = "<p style='margin: 10px 0; color: #6b7280;'>No articles available</p>"
        
        # Build filtering stats HTML
        filtering_html = ""
        if filtering_stats:
            filtering_html = "<ul style='list-style: none; padding: 0; margin: 10px 0;'>"
            if filtering_stats.get('ahead_of_print_filtered', 0) > 0:
                filtering_html += f"<li style='margin: 5px 0;'>Ahead of Print Filtered: <strong>{filtering_stats.get('ahead_of_print_filtered', 0)}</strong></li>"
            if filtering_stats.get('non_research_filtered', 0) > 0:
                filtering_html += f"<li style='margin: 5px 0;'>Non-Research Filtered: <strong>{filtering_stats.get('non_research_filtered', 0)}</strong></li>"
            if filtering_stats.get('no_abstract_filtered', 0) > 0:
                filtering_html += f"<li style='margin: 5px 0;'>No Abstract Filtered: <strong>{filtering_stats.get('no_abstract_filtered', 0)}</strong></li>"
            if filtering_stats.get('title_filtered', 0) > 0:
                filtering_html += f"<li style='margin: 5px 0;'>Title Filtered: <strong>{filtering_stats.get('title_filtered', 0)}</strong></li>"
            filtering_html += "</ul>"
        
        # HTML email body
        html_body = f"""
        <html>
          <head></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 700px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">PubMed Article Processing Summary</h2>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Date Range:</strong> {start_date} to {end_date}</p>
                <p style="margin: 5px 0;"><strong>Status:</strong> {'✅ Success' if success else '❌ Failed'}</p>
                <p style="margin: 5px 0;"><strong>Processing Time:</strong> {time_str}</p>
              </div>
              
              {f'''
              <div style="background-color: #d1fae5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;">
                <h3 style="margin-top: 0; color: #065f46;">Processing Results</h3>
                <ul style="list-style: none; padding: 0;">
                  <li style="margin: 10px 0;">📥 <strong>Articles Collected:</strong> {articles_collected}</li>
                  <li style="margin: 10px 0;">🏷️ <strong>Articles Classified:</strong> {articles_classified}</li>
                  <li style="margin: 10px 0;">💾 <strong>Articles Stored:</strong> {articles_stored}</li>
                </ul>
              </div>
              
              <div style="background-color: #e0f2fe; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2563eb;">
                <h3 style="margin-top: 0; color: #1e40af;">Quality Metrics</h3>
                <ul style="list-style: none; padding: 0;">
                  <li style="margin: 10px 0;">⭐ <strong>Average Ranking Score:</strong> {avg_score}</li>
                  <li style="margin: 10px 0;">🏆 <strong>Articles with Score ≥ 8:</strong> {articles_score_8_plus}</li>
                </ul>
              </div>
              
              {f'''
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                <h3 style="margin-top: 0; color: #92400e;">Category Breakdown</h3>
                {category_html}
              </div>
              ''' if category_breakdown else ''}
              
              {f'''
              <div style="background-color: #ede9fe; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #8b5cf6;">
                <h3 style="margin-top: 0; color: #6b21a8;">Top 5 Articles by Ranking Score</h3>
                {top_articles_html}
              </div>
              ''' if top_articles else ''}
              
              {f'''
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #6b7280;">
                <h3 style="margin-top: 0; color: #374151;">Filtering Statistics</h3>
                {filtering_html if filtering_html else '<p style="margin: 10px 0; color: #6b7280;">No filtering statistics available</p>'}
              </div>
              ''' if filtering_stats else ''}
              ''' if success else f'''
              <div style="background-color: #fee2e2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc2626;">
                <h3 style="margin-top: 0; color: #991b1b;">Error Details</h3>
                <p style="margin: 0;">{error or 'Unknown error occurred during processing.'}</p>
              </div>
              '''}
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
                <p>This is an automated notification from the Internal Medicine App article processing system.</p>
              </div>
            </div>
          </body>
        </html>
        """
        
        # Plain text email body (fallback)
        text_body = f"""
PubMed Article Processing Summary

Date Range: {start_date} to {end_date}
Status: {'Success' if success else 'Failed'}
Processing Time: {time_str}

"""
        if success:
            text_body += f"""
Processing Results:
- Articles Collected: {articles_collected}
- Articles Classified: {articles_classified}
- Articles Stored: {articles_stored}

Quality Metrics:
- Average Ranking Score: {avg_score}
- Articles with Score ≥ 8: {articles_score_8_plus}
"""
            
            if category_breakdown:
                text_body += "\nCategory Breakdown:\n"
                category_items = sorted(category_breakdown.items(), key=lambda x: x[1], reverse=True)
                for category, count in category_items[:10]:
                    text_body += f"- {category}: {count}\n"
            
            if top_articles:
                text_body += "\nTop 5 Articles by Ranking Score:\n"
                for i, article in enumerate(top_articles, 1):
                    title = article.get('title', 'Untitled')
                    score = article.get('score', 0)
                    journal = article.get('journal', 'Unknown')
                    text_body += f"{i}. (Score: {score}) {title} - {journal}\n"
            
            if filtering_stats:
                text_body += "\nFiltering Statistics:\n"
                if filtering_stats.get('ahead_of_print_filtered', 0) > 0:
                    text_body += f"- Ahead of Print Filtered: {filtering_stats.get('ahead_of_print_filtered', 0)}\n"
                if filtering_stats.get('non_research_filtered', 0) > 0:
                    text_body += f"- Non-Research Filtered: {filtering_stats.get('non_research_filtered', 0)}\n"
                if filtering_stats.get('no_abstract_filtered', 0) > 0:
                    text_body += f"- No Abstract Filtered: {filtering_stats.get('no_abstract_filtered', 0)}\n"
                if filtering_stats.get('title_filtered', 0) > 0:
                    text_body += f"- Title Filtered: {filtering_stats.get('title_filtered', 0)}\n"
        else:
            text_body += f"""
Error Details:
{error or 'Unknown error occurred during processing.'}
"""
        
        text_body += "\n\nThis is an automated notification from the Internal Medicine App article processing system."
        
        # Attach both plain text and HTML versions
        part1 = MIMEText(text_body, 'plain')
        part2 = MIMEText(html_body, 'html')
        
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
        
        logger.info(f"Successfully sent summary email to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send summary email to {to_email}: {e}", exc_info=True)
        return False

