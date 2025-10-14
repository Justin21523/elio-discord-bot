# -*- coding: utf-8 -*-
"""
MongoDB Atlas Vector Search backend for RAG.
English-only code/comments.

Implements a drop-in alternative to ChineseRAGEngine with the same public methods:
- add_document(ProcessedDoc) -> List[RetrievalHit]
- search(RetrievalQuery) -> List[RetrievalHit]   (modes: semantic | bm25 | hybrid)
- list_documents(), delete_document(), set_chunk_disabled()
- export_json()/import_json() for bootstrap (non-authoritative; AVS holds truth)

Schema (chunks collection):
  {
    _id: <chunk_id>,
    chunk_id: <chunk_id>,
    doc_id: <doc_id>,
    text: str,
    embedding: [float],
    namespace: str | null,
    tags: [str],
    disabled: bool,
    metadata: dict,
    created_at: epoch_s
  }

Docs collection:
  { _id: <doc_id>, namespace: str | null, tags:[str], count:int, created_at: epoch_s }
"""

from __future__ import annotations

import time
import logging
from typing import Any, Dict, List, Optional, Tuple

from pymongo import MongoClient, ASCENDING, DESCENDING, errors
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import ServerSelectionTimeoutError

from .config import get_config
from .rag import (
    ProcessedDoc,
    RetrievalQuery,
    RetrievalHit,
    EmbeddingManager,
    get_embedding_manager,
)

_cfg = get_config()
logger = logging.getLogger("core.rag_avs")


# ---------- Mongo helpers ----------

def _mongo() -> MongoClient:
    """Create a Mongo client using config."""
    if not _cfg.mongo.uri:
        raise RuntimeError("MONGO_URI not set")
    return MongoClient(_cfg.mongo.uri, serverSelectionTimeoutMS=5000)


def _coll_names(_: Optional[Database] = None) -> Tuple[str, str]:
    """Return (chunks_collection_name, docs_collection_name)."""
    return _cfg.mongo.coll_chunks, _cfg.mongo.coll_docs


def _supports_background_option(coll: Collection) -> bool:
    """
    MongoDB 5.0+ no longer needs/accepts the `background` option for index creation.
    Return True if we should keep `background`, False if we should strip it.
    """
    try:
        v = coll.database.client.server_info().get("versionArray", [5, 0, 0])
        return int(v[0]) < 5
    except Exception:
        # Be conservative: unknown version -> treat as not supported
        return False


def _safe_create_index(coll: Collection, keys, name: Optional[str] = None, **kwargs) -> None:
    """
    Create index safely:
      1) Never attempt to create the _id index (Mongo creates it automatically and
         does not accept any option for it).
      2) On MongoDB >= 5, drop the `background` option.
      3) Downgrade failures to warnings so the service doesn't crash on startup.
    """
    # 1) Skip _id
    if len(keys) == 1 and keys[0][0] == "_id":
        logger.debug("Skip creating _id index; MongoDB creates it automatically.")
        return

    # 2) Strip `background` on newer Mongo
    if not _supports_background_option(coll):
        kwargs.pop("background", None)

    try:
        coll.create_index(keys, name=name, **kwargs)
        logger.info("Index ensured: %s (name=%s)", keys, name)
    except errors.OperationFailure as e:
        logger.warning("Ignore index create failure for %s (name=%s): %s", keys, name, e)
    except Exception as e:
        logger.warning("Index create unexpected error for %s (name=%s): %s", keys, name, e)


# ---------- RAG Engine (Atlas Vector Search backend) ----------

class ChineseRAGEngineAVS:
    """Atlas Vector Search powered RAG engine."""

    # Attributes
    _client: MongoClient
    _db: Database

    coll_docs_name: str
    coll_chunks_name: str

    docs: Collection
    chunks: Collection

    embed: EmbeddingManager

    def __init__(self, embedding_manager: Optional[EmbeddingManager] = None) -> None:
        # Embeddings manager
        self.embed = embedding_manager or get_embedding_manager()

        # Mongo init
        self._client = _mongo()
        self._db = self._client[_cfg.mongo.db]
        self.coll_chunks_name, self.coll_docs_name = _coll_names(self._db)
        self.docs = self._db[self.coll_docs_name]
        self.chunks = self._db[self.coll_chunks_name]

        # Smoke test connection & ensure indexes
        try:
            _ = self.docs.estimated_document_count()
        except ServerSelectionTimeoutError as e:
            raise RuntimeError(f"Mongo connection failed: {e}")

        self.ensure_base_indexes()

    # ---- indexes ----
    def ensure_base_indexes(self) -> None:
        """
        Ensure collection indexes. DO NOT attempt to create _id index.
        Only create commonly used query indexes; leave _id to Mongo.
        """
        # docs common query indexes
        _safe_create_index(
            self.docs,
            [("guildId", ASCENDING), ("createdAt", DESCENDING)],
            name="guild_created_idx",
            background=True,
        )
        _safe_create_index(
            self.docs,
            [("tags", ASCENDING)],
            name="tags_idx",
            background=True,
        )
        _safe_create_index(
            self.docs,
            [("disabled", ASCENDING)],
            name="disabled_idx",
            background=True,
        )

        # chunks side (optional; keep if your queries rely on these)
        _safe_create_index(
            self.chunks,
            [("doc_id", ASCENDING)],
            name="chunk_doc_idx",
            background=True,
        )
        # If you do not use columnstore or your version doesn't support it, keep this commented.
        # _safe_create_index(
        #     self.chunks,
        #     [("embedding", "columnstore")],
        #     name="vec_colstore",
        #     background=True,
        # )

    # -------- ingestion --------

    def add_document(self, processed: ProcessedDoc) -> List[RetrievalHit]:
        """
        Upsert doc metadata and insert chunk records with embeddings.
        """
        # collect namespace/tags from chunks
        ns = None
        tags: List[str] = []
        for c in processed.chunks:
            meta = c.get("metadata", {}) or {}
            ns = meta.get("namespace", ns)
            tags.extend(meta.get("tags", []) or [])
        tags = sorted(set(tags))

        # upsert doc meta
        self.docs.update_one(
            {"_id": processed.doc_id},
            {
                "$set": {"namespace": ns, "tags": tags},
                "$setOnInsert": {"created_at": int(time.time()), "count": 0, "disabled": False},
            },
            upsert=True,
        )

        # encode and build chunk documents
        texts = [c["text"] for c in processed.chunks]
        vecs = self.embed.encode(texts) if texts else []
        to_ins: List[Dict[str, Any]] = []
        now = int(time.time())
        for i, c in enumerate(processed.chunks):
            meta = c.get("metadata", {}) or {}
            to_ins.append(
                {
                    "_id": c["id"],               # chunk_id as _id
                    "chunk_id": c["id"],
                    "doc_id": processed.doc_id,
                    "text": c["text"],
                    "embedding": vecs[i].tolist() if i < len(vecs) else [],
                    "namespace": meta.get("namespace"),
                    "tags": meta.get("tags", []) or [],
                    "disabled": bool(meta.get("disabled", False)),
                    "metadata": meta,
                    "created_at": now,
                }
            )

        if to_ins:
            # ordered=False allows dedup insert
            try:
                self.chunks.insert_many(to_ins, ordered=False)
            except errors.BulkWriteError as e:
                # ignore duplicate key errors to allow idempotent ingestion
                dup = [we for we in e.details.get("writeErrors", []) if we.get("code") == 11000]
                if len(dup) != len(e.details.get("writeErrors", [])):
                    logger.warning("Non-duplicate write errors during insert_many: %s", e.details)
            # increase doc chunk count
            self.docs.update_one({"_id": processed.doc_id}, {"$inc": {"count": len(to_ins)}})

        return [RetrievalHit(id=x["_id"], content=x["text"], score=0.0, metadata=x.get("metadata", {})) for x in to_ins]

    # -------- admin --------

    def list_documents(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if namespace:
            q["namespace"] = namespace
        cur = self.docs.find(q).sort("count", -1)
        return [
            {
                "doc_id": d["_id"],
                "namespace": d.get("namespace"),
                "tags": d.get("tags", []),
                "count": d.get("count", 0),
                "created_at": d.get("created_at"),
            }
            for d in cur
        ]

    def delete_document(self, doc_id: str) -> int:
        res = self.chunks.delete_many({"doc_id": doc_id})
        self.docs.delete_one({"_id": doc_id})
        return int(res.deleted_count)

    def set_chunk_disabled(self, chunk_id: str, disabled: bool = True) -> bool:
        res = self.chunks.update_one({"_id": chunk_id}, {"$set": {"disabled": bool(disabled)}})
        return res.modified_count > 0

    def export_json(self) -> Dict[str, Any]:
        """Non-authoritative export; useful for bootstrap/testing (vectors omitted)."""
        docs = list(self.docs.find({}))
        chunks = list(self.chunks.find({}, {"embedding": 0}))  # omit vectors to save size
        return {
            "docs": [
                {
                    "doc_id": d["_id"],
                    "namespace": d.get("namespace"),
                    "tags": d.get("tags", []),
                    "count": d.get("count", 0),
                    "created_at": d.get("created_at"),
                }
                for d in docs
            ],
            "chunks": [{"id": c["_id"], "text": c["text"], "meta": c.get("metadata", {})} for c in chunks],
            "backend": "avs",
            "ts": int(time.time()),
            "version": 1,
        }

    def import_json(self, payload: Dict[str, Any]) -> None:
        """Bootstrap small datasets (re-embeds)."""
        from .rag import DocumentProcessor
        dp = DocumentProcessor()
        # group chunks by doc_id from meta or id prefix
        by_doc: Dict[str, List[Dict[str, Any]]] = {}
        for c in payload.get("chunks", []):
            cid = c["id"]
            doc_id = cid.split(":", 1)[0]
            by_doc.setdefault(doc_id, []).append(c)
        for doc_id, chunks in by_doc.items():
            text = "\n\n".join([c["text"] for c in chunks])
            ns = None
            tags: List[str] = []
            for c in chunks:
                meta = c.get("meta", {}) or {}
                ns = meta.get("namespace", ns)
                tags.extend(meta.get("tags", []) or [])
            processed = dp.process_text(text, doc_id=doc_id, namespace=ns, tags=sorted(set(tags)))
            self.add_document(processed)

    # -------- search --------

    def _filters(
        self,
        namespace: Optional[str],
        tags_any: Optional[List[str]],
        tags_all: Optional[List[str]],
    ) -> Dict[str, Any]:
        flt: Dict[str, Any] = {"disabled": False}
        if namespace:
            flt["namespace"] = namespace
        if tags_any:
            flt["tags"] = {"$in": tags_any}
        if tags_all:
            flt.setdefault("tags", {})
            flt["tags"]["$all"] = tags_all
        return flt

    def _semantic(
        self,
        query: str,
        top_k: int,
        namespace: Optional[str],
        tags_any: Optional[List[str]],
        tags_all: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        qvec = self.embed.encode([query])[0].tolist()
        pipeline = [
            {
                "$vectorSearch": {
                    "index": _cfg.mongo.avs_index,
                    "path": "embedding",
                    "queryVector": qvec,
                    "numCandidates": max(top_k * 20, 200),
                    "limit": top_k,
                    "filter": self._filters(namespace, tags_any, tags_all),
                }
            },
            {"$project": {"_id": 1, "text": 1, "metadata": 1, "score": {"$meta": "vectorSearchScore"}}},
        ]
        return list(self.chunks.aggregate(pipeline))

    def _bm25(
        self,
        query: str,
        top_k: int,
        namespace: Optional[str],
        tags_any: Optional[List[str]],
        tags_all: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        Uses Atlas Search 'text' operator (requires an Atlas Search text index).
        If not available, falls back to a naive regex search (lower quality).
        """
        try:
            pipeline = [
                {
                    "$search": {
                        "index": _cfg.mongo.text_index,
                        "text": {"query": query, "path": "text"},
                        "returnStoredSource": True,
                        "score": {"boost": {"value": 1}},
                    }
                },
                {"$match": self._filters(namespace, tags_any, tags_all)},
                {"$limit": top_k},
                {"$project": {"_id": 1, "text": 1, "metadata": 1, "score": {"$meta": "searchScore"}}},
            ]
            return list(self.chunks.aggregate(pipeline))
        except Exception:
            # Fallback: regex match
            rx = {"$regex": query, "$options": "i"}
            cur = self.chunks.find(
                {**self._filters(namespace, tags_any, tags_all), "text": rx},
                {"_id": 1, "text": 1, "metadata": 1},
            ).limit(top_k)
            return [{"_id": d["_id"], "text": d["text"], "metadata": d.get("metadata", {}), "score": 0.1} for d in cur]

    def search(self, q: RetrievalQuery) -> List[RetrievalHit]:
        if q.mode == "semantic":
            sem = self._semantic(q.text, q.top_k, q.namespace, q.tags_any, q.tags_all)
            return [
                RetrievalHit(
                    id=d["_id"],
                    content=d["text"],
                    score=float(d.get("score", 0.0)),
                    metadata=d.get("metadata", {}),
                )
                for d in sem
            ]

        if q.mode == "bm25":
            bm = self._bm25(q.text, q.top_k, q.namespace, q.tags_any, q.tags_all)
            return [
                RetrievalHit(
                    id=d["_id"],
                    content=d["text"],
                    score=float(d.get("score", 0.0)),
                    metadata=d.get("metadata", {}),
                )
                for d in bm
            ]

        # hybrid: simple late-fusion with min-max normalization and linear blend
        sem = self._semantic(q.text, max(q.top_k, 20), q.namespace, q.tags_any, q.tags_all)
        bm = self._bm25(q.text, max(q.top_k, 20), q.namespace, q.tags_any, q.tags_all)

        def norm(lst: List[Dict[str, Any]]) -> Dict[Any, float]:
            if not lst:
                return {}
            scores = [float(x.get("score", 0.0)) for x in lst]
            mx, mn = max(scores), min(scores)
            rng = (mx - mn) or 1.0
            return {x["_id"]: (float(x.get("score", 0.0)) - mn) / rng for x in lst}

        s_sem = norm(sem)
        s_bm = norm(bm)
        keys = set(s_sem.keys()) | set(s_bm.keys())

        fused: List[RetrievalHit] = []
        for k in keys:
            score = q.alpha * s_sem.get(k, 0.0) + (1 - q.alpha) * s_bm.get(k, 0.0)
            row = next((x for x in sem if x["_id"] == k), None) or next((x for x in bm if x["_id"] == k), None)
            fused.append(
                RetrievalHit(
                    id=row["_id"],  # type: ignore[index]
                    content=row["text"],  # type: ignore[index]
                    score=float(score),
                    metadata=row.get("metadata", {}),  # type: ignore[union-attr]
                )
            )
        fused.sort(key=lambda h: h.score, reverse=True)
        return fused[: q.top_k]
