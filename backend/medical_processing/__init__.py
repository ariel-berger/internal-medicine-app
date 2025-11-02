"""
Medical Articles Processing Module

This module provides functionality for:
- Collecting articles from PubMed
- AI-powered classification using Claude/Gemini
- Database operations for medical articles
- Weekly automated processing
"""

# Keep package init light to avoid importing heavy/optional deps (e.g., AI SDKs) at startup
# Consumers should import symbols directly from submodules when needed.

__all__ = []
