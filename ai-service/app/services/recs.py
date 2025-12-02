"""
Lightweight recommender using Mongo user_metrics.
Blend popularity, user history, win rate, recency, and achievements (CPU-only).
"""
from __future__ import annotations
from typing import List, Dict
from pymongo import MongoClient
from math import sqrt
from app.config import Settings

settings = Settings()
_client = None


def get_client():
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGODB_URI)
    return _client


def recency_weight(ts):
    if not ts:
        return 1.0
    try:
        import datetime
        if isinstance(ts, str):
            ts = datetime.datetime.fromisoformat(ts)
        age = (datetime.datetime.utcnow() - ts).total_seconds()
        if age < 3600:
            return 0.4
        if age < 6 * 3600:
            return 0.7
        return 1.0
    except Exception:
        return 1.0


def recommend_games(user_id: str, guild_id: str | None = None, top_k: int = 3) -> List[Dict]:
    client = get_client()
    db = client.get_database(settings.MONGODB_DB)
    metrics = db.user_metrics
    inventory = db.inventory

    user_doc = metrics.find_one({"userId": user_id, "guildId": guild_id})

    # Global popularity
    agg = metrics.aggregate([
        {"$group": {"_id": None, "games": {"$push": "$gameCounts"}}}
    ])
    popularity = {}
    for doc in agg:
        for gc in doc.get("games", []):
            for g, c in gc.items():
                popularity[g] = popularity.get(g, 0) + c

    if not user_doc or not user_doc.get("gameCounts"):
        return add_reason(top_n(popularity, top_k), "人氣推薦")

    user_counts = user_doc.get("gameCounts", {})
    user_norm = sqrt(sum(v * v for v in user_counts.values()) or 1)
    win_rates = user_doc.get("winRates", {})
    last_played = user_doc.get("lastPlayed", {})

    ach_doc = inventory.find_one({"userId": user_id, "guildId": guild_id})
    ach_count = len(ach_doc.get("achievements", [])) if ach_doc else 0

    scores = {}
    for game, count in popularity.items():
        u = user_counts.get(game, 0)
        recency = recency_weight(last_played.get(game))
        win_bonus = 0.2 * win_rates.get(game, 0)
        ach_bonus = 0.05 * ach_count
        score_val = ((u / user_norm) if user_norm else 0) * recency + 0.5 * count + win_bonus + ach_bonus
        scores[game] = score_val

    return add_reason(top_n(scores, top_k), "混合: 遊玩/勝率/成就/人氣")


def top_n(scores: Dict[str, float], k: int) -> List[Dict]:
    return [
        {"game": g, "score": s}
        for g, s in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:k]
    ]


def add_reason(items: List[Dict], reason: str) -> List[Dict]:
    for i in items:
        i["reason"] = reason
    return items
