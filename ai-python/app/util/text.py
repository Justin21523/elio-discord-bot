# -*- coding: utf-8 -*-
"""Text helpers. All code/comments in English only."""

from __future__ import annotations

import re
from typing import Iterable, List


def normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def take_head_para(text: str, limit_chars: int = 400) -> str:
    t = normalize_ws(text)
    return (t[:limit_chars] + "…") if len(t) > limit_chars else t


def numbered_citations(snippets: List[str]) -> str:
    """Return a string with [1]..[n] numbered snippets."""
    lines = []
    for i, t in enumerate(snippets, 1):
        t = normalize_ws(t)
        lines.append(f"[{i}] {t}")
    return "\n".join(lines)


def majority_vote(strings: Iterable[str]) -> str:
    """
    Pick the string that is most similar (by token overlap) to others.
    Cheap approximation to centroid choice.
    """
    xs = list(strings)
    if not xs:
        return ""
    if len(xs) == 1:
        return xs[0]
    # crude Jaccard on word sets
    sets = [set(re.findall(r"\w+", s.lower())) for s in xs]
    scores = []
    for i, si in enumerate(sets):
        score = 0.0
        for j, sj in enumerate(sets):
            if i == j:
                continue
            inter = len(si & sj)
            union = len(si | sj) or 1
            score += inter / union
        scores.append(score)
    idx = max(range(len(xs)), key=lambda k: scores[k])
    return xs[idx]
