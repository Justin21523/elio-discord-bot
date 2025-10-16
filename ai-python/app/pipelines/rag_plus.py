# -*- coding: utf-8 -*-
"""
RAG+ pipeline with multi-query, RRF fusion, MMR compression, self-consistency,
and faithfulness check. All code/comments in English only.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple

from core.llm import EnhancedLLMAdapter
from core.rag import ChineseRAGEngine, RetrievalQuery, get_embedding_manager
from ..util.text import numbered_citations, majority_vote, take_head_para


@dataclass
class Retrieved:
    content: str
    score: float
    meta: Dict[str, Any]


def rrf_fuse(rank_lists: List[List[Retrieved]], k: int = 60, c: int = 60) -> List[Retrieved]:
    """
    Reciprocal Rank Fusion.
    rank_lists: list of rankings (best first).
    Returns fused list (unique by content hash) with RRF scores.
    """
    scores: Dict[str, float] = {}
    items: Dict[str, Retrieved] = {}

    def key(it: Retrieved) -> str:
        # de-dup by short head; in production use stable chunk id
        return take_head_para(it.content, 96).lower()

    for rl in rank_lists:
        for rnk, it in enumerate(rl, start=1):
            kstr = key(it)
            items[kstr] = it
            scores[kstr] = scores.get(kstr, 0.0) + 1.0 / (c + rnk)
    fused = sorted(items.values(), key=lambda x: scores[key(x)], reverse=True)
    return fused[:k]


def mmr_select(query_vec, cand_vecs, texts: List[str], top_k=6, lambda_=0.7):
    """
    Maximal Marginal Relevance selection over candidate embeddings.
    """
    import numpy as np

    def cos(a, b):
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))

    selected, selected_ix = [], []
    cand_ix = list(range(len(texts)))
    if not cand_ix:
        return []
    # Precompute similarities
    sim_to_q = [cos(query_vec, v) for v in cand_vecs]
    cand_set = set(cand_ix)
    while len(selected) < min(top_k, len(texts)) and cand_set:
        if not selected_ix:
            i = max(cand_set, key=lambda j: sim_to_q[j])
            selected_ix.append(i)
            cand_set.remove(i)
            continue
        def mmr_score(j):
            div = 0.0
            for i in selected_ix:
                div = max(div, cos(cand_vecs[j], cand_vecs[i]))
            return lambda_ * sim_to_q[j] - (1 - lambda_) * div
        i = max(cand_set, key=mmr_score)
        selected_ix.append(i)
        cand_set.remove(i)
    return [texts[i] for i in selected_ix]


class RAGPlus:
    """
    Orchestrates advanced retrieval and answer generation.
    """

    def __init__(self) -> None:
        self.llm = EnhancedLLMAdapter()
        self.engine = ChineseRAGEngine(embedding_manager=get_embedding_manager())
        self.embed = get_embedding_manager()

    # ---- Steps ----

    def rewrite_queries(self, question: str, n: int = 3) -> List[str]:
        """Multi-query rewrite using the LLM (cheap prompts)."""
        prompt = (
            "Rewrite the user's question into N diverse, short search queries.\n"
            "Be specific but concise. Output one per line, no numbering.\n\n"
            f"User question: {question}\nN=3\nQueries:"
        )
        out = self.llm.generate_text(prompt, max_length=120, temperature=0.8)
        qs = [q.strip("-• \n") for q in out.splitlines() if q.strip()]
        # ensure original question included
        if question.strip() not in qs:
            qs.append(question.strip())
        # unique and truncate
        uniq = []
        seen = set()
        for q in qs:
            q2 = q[:128]
            if q2.lower() in seen:
                continue
            seen.add(q2.lower())
            uniq.append(q2)
        return uniq[:n]

    def retrieve_for(self, q: str, top_k: int, mode: str) -> List[Retrieved]:
        hits = self.engine.search(RetrievalQuery(text=q, top_k=top_k, mode=mode)) # type: ignore
        return [Retrieved(h.content, float(getattr(h, "score", 0.0)), h.model_dump()) for h in hits]

    def compress_context(self, question: str, chunks: List[Retrieved], out_k: int = 6) -> Tuple[str, List[Dict[str, Any]]]:
        """Contextual compression via MMR over embeddings."""
        texts = [c.content for c in chunks]
        if not texts:
            return "", []
        vecs = self.embed.encode(texts)
        qvec = self.embed.encode([question])[0]
        selected = mmr_select(qvec, vecs, texts, top_k=out_k, lambda_=0.7)
        ctx = numbered_citations(selected)
        # keep only selected in meta (best-effort filter)
        metas = []
        for s in selected:
            for c in chunks:
                if s.strip() in c.content:
                    metas.append(c.meta)
                    break
        return ctx, metas

    def generate_answers(self, question: str, ctx_str: str, n: int = 3) -> List[str]:
        """Self-consistency: sample multiple answers then vote."""
        sys = "Answer precisely using the numbered context. Add [#] after facts."
        base = f"{sys}\n\nContext:\n{ctx_str}\n\nQuestion: {question}\nAnswer:"
        outs = []
        temps = [0.2, 0.4, 0.6][:n]
        for t in temps:
            outs.append(self.llm.generate_text(base, max_length=520, temperature=t))
        return outs

    def faithfulness_check(self, question: str, ctx_str: str, answer: str) -> float:
        """
        Ask the LLM to rate faithfulness on 0..1; this is a heuristic.
        """
        prompt = (
            "You are a strict fact-checker. Score how well the answer is supported by the numbered context.\n"
            "Return only a number between 0 and 1 (e.g., 0.75).\n\n"
            f"Context:\n{ctx_str}\n\nQuestion: {question}\nAnswer:\n{answer}\n\nScore:"
        )
        raw = self.llm.generate_text(prompt, max_length=8, temperature=0.0)
        try:
            val = float(raw.strip().split()[0])
            if math.isnan(val) or val < 0 or val > 1:
                return 0.0
            return float(val)
        except Exception:
            return 0.0

    # ---- Public ----

    def run(self, question: str, top_k: int = 8, mode: str = "hybrid") -> Dict[str, Any]:
        # 1) multi-query
        queries = self.rewrite_queries(question, n=3)

        # 2) retrieve per query
        per_query = [self.retrieve_for(q, top_k=top_k, mode=mode) for q in queries]

        # 3) RRF fuse
        fused = rrf_fuse(per_query, k=top_k * 2)

        # 4) MMR compress
        ctx_str, ctx_meta = self.compress_context(question, fused, out_k=min(8, top_k))

        # 5) self-consistency
        answers = self.generate_answers(question, ctx_str, n=3)
        final = majority_vote(answers)

        # 6) faithfulness score
        faith = self.faithfulness_check(question, ctx_str, final)

        return {
            "answer": final,
            "faithfulness": faith,
            "queries": queries,
            "context_str": ctx_str,
            "context": ctx_meta,
            "retrieved": [r.meta for r in fused],
            "samples": answers,
        }
