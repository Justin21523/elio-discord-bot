"""
IR utilities (CPU-only) using scikit-learn TF-IDF and simple pseudo-Rocchio.
"""
from __future__ import annotations
from typing import List, Dict
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np


def clue_search(docs: List[Dict], query: str, top_k: int = 1) -> Dict:
    """Return top snippet for clue hunt."""
    corpus = [d.get("text") or d.get("passage") or "" for d in docs]
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf = vectorizer.fit_transform(corpus)
    q_vec = vectorizer.transform([query])
    scores = (tfidf @ q_vec.T).toarray().ravel()
    best_idx = int(np.argmax(scores))
    best_doc = docs[best_idx]
    snippet = best_doc.get("text") or best_doc.get("passage") or ""
    return {
        "doc_id": best_doc.get("id"),
        "score": float(scores[best_idx]),
        "snippet": best_sentence(snippet, query),
    }


def doc_search(docs: List[Dict], query: str, top_k: int = 3) -> Dict:
    """
    Document hunt with pseudo-Rocchio: take top doc, boost its terms, rescore, and return best snippet.
    """
    corpus = [d.get("text") or d.get("passage") or "" for d in docs]
    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf = vectorizer.fit_transform(corpus)
    q_vec = vectorizer.transform([query])

    scores = (tfidf @ q_vec.T).toarray().ravel()
    top_idx = int(np.argmax(scores))
    feedback_doc = corpus[top_idx]

    # pseudo-Rocchio: boost terms from feedback doc
    fb_vec = vectorizer.transform([feedback_doc])
    alpha, beta = 1.0, 0.5
    new_query_vec = alpha * q_vec + beta * fb_vec
    new_scores = (tfidf @ new_query_vec.T).toarray().ravel()
    best_idx = int(np.argmax(new_scores))
    best_doc = docs[best_idx]
    snippet = best_doc.get("text") or best_doc.get("passage") or ""

    return {
        "doc_id": best_doc.get("id"),
        "score": float(new_scores[best_idx]),
        "snippet": best_sentence(snippet, query),
    }


def best_sentence(text: str, query: str) -> str:
    sentences = text.split(".")
    q_terms = set(query.lower().split())
    best = ("", -1)
    for s in sentences:
        tokens = s.lower().split()
        score = sum(1 for t in tokens if t in q_terms)
        if score > best[1]:
            best = (s.strip(), score)
    return best[0] or text
