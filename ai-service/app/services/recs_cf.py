"""
Collaborative filtering (cosine-style) for game recommendations.
Uses user_metrics (gameCounts) from MongoDB. CPU-only.
"""
from __future__ import annotations
from typing import Dict, List
from math import sqrt
from pymongo import MongoClient
from app.config import Settings

settings = Settings()
_client = None


def get_client():
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGODB_URI)
    return _client


def recommend_games_cf(user_id: str, guild_id: str | None = None, top_k: int = 3) -> List[Dict]:
    client = get_client()
    db = client.get_database(settings.MONGODB_DB)
    metrics = db.user_metrics

    target = metrics.find_one({"userId": user_id, "guildId": guild_id})
    if not target or not target.get("gameCounts"):
        return []

    user_vec = target.get("gameCounts", {})
    user_norm = sqrt(sum(v * v for v in user_vec.values()) or 1)

    sims = []
    cursor = metrics.find({"guildId": guild_id})
    for other in cursor:
        if other["userId"] == user_id:
            continue
        ov = other.get("gameCounts", {})
        if not ov:
            continue
        dot = sum(user_vec.get(g, 0) * ov.get(g, 0) for g in set(user_vec) | set(ov))
        norm = sqrt(sum(v * v for v in ov.values()) or 1)
        cos = dot / (user_norm * norm) if norm else 0
        if cos > 0:
            sims.append((other, cos))

    if not sims:
        return []

    # Weighted sum of similar users' preferences
    scores: Dict[str, float] = {}
    for other, sim in sims:
        for g, c in other.get("gameCounts", {}).items():
            scores[g] = scores.get(g, 0) + sim * c

    return [
        {"game": g, "score": s}
        for g, s in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:top_k]
    ]
