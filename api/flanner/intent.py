"""
Intent parsing for user replies. Outputs one of:
    YES      — confirm the current plan
    PASS     — skip/cancel this week
    MODIFY   — apply feedback and regenerate (feedback text returned too)
    UNKNOWN  — couldn't tell; caller decides next move

Supports Korean + English. Bare greetings/acks intentionally return UNKNOWN
to prevent wasted regenerations on "hi" / "thanks" etc.
"""
from __future__ import annotations

import re

YES_TOKENS = (
    "yes", "y", "ok", "okay", "sure", "go", "proceed", "confirm",
    "예", "오케이", "좋아", "진행",
)
PASS_TOKENS = (
    "skip", "pass", "cancel", "no", "nope", "later", "not now",
    "패스", "그만", "나중에",
)
MODIFY_PREFIXES = (
    "modify", "change", "edit", "update", "revise",
    "수정", "변경", "바꿔",
)
GREETING_TOKENS = {
    "안녕", "안녕하세요", "하이", "헬로", "헬로우", "ㅎㅇ", "하잉", "반가워",
    "hi", "hello", "hey", "yo", "hola", "sup", "what's up", "whats up",
    "ok thanks", "고마워", "땡큐", "thanks", "thank you", "ty",
    # These trigger first-turn in the TS loop but are UNKNOWN on follow-ups
    "start", "시작", "go", "run",
}
FEEDBACK_KEYWORDS = (
    "빼줘", "넣어줘", "없이", "말고", "대신", "말고요", "제외",
    "싫어", "alergy", "allergy", "알러지",
    "비건", "vegan", "채식", "vegetarian",
    "불", "달러", "dollar", "dollars", "bucks", "$", "budget", "예산",
    "줄여", "더", "less", "more", "no ", "without", "avoid",
)


def parse(text: str) -> tuple[str, str | None]:
    """Return (intent, feedback_or_none)."""
    raw = (text or "").strip()
    low = raw.lower()

    if not raw:
        return "UNKNOWN", None

    for pref in MODIFY_PREFIXES:
        if low.startswith(pref):
            rest = raw[len(pref):].lstrip(": ").strip()
            return "MODIFY", rest or None

    if low in YES_TOKENS:
        return "YES", None
    if low in PASS_TOKENS:
        return "PASS", None

    words = re.split(r"\s+", low)
    if len(words) <= 2:
        if any(w in YES_TOKENS for w in words):
            return "YES", None
        if any(w in PASS_TOKENS for w in words):
            return "PASS", None

    if low in GREETING_TOKENS:
        return "UNKNOWN", None

    if any(k in low for k in FEEDBACK_KEYWORDS):
        return "MODIFY", raw

    if len(raw) >= 6 and re.search(r"[a-zA-Z가-힣]", raw):
        return "MODIFY", raw

    return "UNKNOWN", None
