import os
from typing import List, Dict, Any, Optional
from pymongo import MongoClient, UpdateOne
import numpy as np

# Expected Atlas Vector Search index configured on collection `rag_docs`
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "communiverse_bot")
COLL_NAME = os.getenv("RAG_COLL", "rag_docs")
EMBED_FIELD = os.getenv("RAG_EMBED_FIELD", "vector")
TEXT_FIELD = os.getenv("RAG_TEXT_FIELD", "text")
META_FIELDS = [x for x in os.getenv("RAG_META_FIELDS", "guildId,tags,source,docId,title").split(",") if x]
RAG_BACKEND = os.getenv("RAG_BACKEND", "local").lower()  # 'local' | 'mongo_avs'

_client = None
_coll = None

def _get_collection():
    global _client, _coll
    if _coll is None:
        _client = MongoClient(MONGO_URI)
        _coll = _client[DB_NAME][COLL_NAME]
        # Minimal normal index for fast guildId filter
        try:
            _coll.create_index("guildId")
            _coll.create_index("docId")
        except Exception:
            pass
    return _coll

def upsert_docs(docs: List[Dict[str, Any]]) -> int:
    """
    Upsert batch: each { docId, text, vector, guildId, tags?, source?, title? }
    """
    coll = _get_collection()
    ops = []
    for d in docs:
        key = {"docId": d["docId"], "guildId": d.get("guildId")}
        body = {TEXT_FIELD: d["text"], EMBED_FIELD: d["vector"]}
        for f in META_FIELDS:
            if f in d:
                body[f] = d[f]
        ops.append(UpdateOne(key, {"$set": body}, upsert=True))
    if not ops:
        return 0
    res = coll.bulk_write(ops, ordered=False)
    return (res.upserted_count or 0) + (res.modified_count or 0)

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb)) # type: ignore

def search_local(query_vector: List[float], k: int = 5, filter_query: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    coll = _get_collection()
    mongo_filter = filter_query or {}
    cursor = coll.find(mongo_filter, {TEXT_FIELD: 1, EMBED_FIELD: 1, **{f: 1 for f in META_FIELDS}, "_id": 0})
    q = np.array(query_vector, dtype=float)
    scored = []
    for doc in cursor:
        v = np.array(doc.get(EMBED_FIELD, []), dtype=float)
        score = _cosine(q, v)
        doc_copy = {k: doc.get(k) for k in [TEXT_FIELD] + META_FIELDS if k in doc}
        doc_copy["_score"] = score
        scored.append(doc_copy)
    scored.sort(key=lambda x: x["_score"], reverse=True)
    return scored[:k]

def search_avs(query_vector: List[float], k: int = 5, filter_query: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Atlas Vector Search ($vectorSearch). Requires an Atlas cluster with a search index named 'rag_vector_index'.
    """
    coll = _get_collection()
    stages = []
    if filter_query:
        stages.append({"$match": filter_query})
    stages.append({
        "$vectorSearch": {
            "index": "rag_vector_index",
            "path": EMBED_FIELD,
            "queryVector": query_vector,
            "numCandidates": max(k * 10, 100),
            "limit": k
        }
    })
    stages.append({
        "$project": {TEXT_FIELD: 1, **{f: 1 for f in META_FIELDS}, "_id": 0}
    })
    return list(coll.aggregate(stages))

def search(query_vector: List[float], k: int = 5, filter_query: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if RAG_BACKEND == "mongo_avs":
        return search_avs(query_vector, k, filter_query)
    # default: local
    return search_local(query_vector, k, filter_query)