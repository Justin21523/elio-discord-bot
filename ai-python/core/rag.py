# -*- coding: utf-8 -*-
"""RAG building blocks (DocumentProcessor, EmbeddingManager, ChineseRAGEngine).
English-only code/comments. Minimal deps with graceful fallbacks.

Enhancements:
- Namespaces and tags on documents/chunks
- Filters in search: namespace, tags (any/all)
- Disable/enable chunks; delete document(s)
- List documents with stats
- Export/import (JSON) for persistence bootstrap
"""

from __future__ import annotations

import hashlib
import math
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

import numpy as np

from .config import get_config

_cfg = get_config()


# -------------------------
# Document processing
# -------------------------

@dataclass
class ProcessedDoc:
    doc_id: str
    chunks: List[Dict[str, Any]]  # each: {id, text, metadata}


class DocumentProcessor:
    """Very light text/file processor with paragraph/length-based chunking."""

    def __init__(self, max_chunk_chars: int = 700, overlap: int = 80) -> None:
        self.max_chunk_chars = max_chunk_chars
        self.overlap = overlap

    def _split_paragraphs(self, text: str) -> List[str]:
        parts = re.split(r"\n{2,}", text)
        parts = [re.sub(r"\s+", " ", p).strip() for p in parts if p.strip()]
        return parts

    def _chunk(self, text: str) -> List[str]:
        paras = self._split_paragraphs(text)
        if not paras:
            return []
        chunks: List[str] = []
        buf = ""
        for p in paras:
            if len(buf) + len(p) + 1 <= self.max_chunk_chars:
                buf = (buf + " " + p).strip()
            else:
                if buf:
                    chunks.append(buf)
                # start a new buffer with overlap
                if chunks:
                    prefix = chunks[-1][-self.overlap :]
                    buf = (prefix + " " + p).strip()
                else:
                    buf = p
        if buf:
            chunks.append(buf)
        return chunks

    def process_text(
        self,
        text: str,
        doc_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        namespace: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> ProcessedDoc:
        doc_id = doc_id or str(uuid.uuid4())
        metadata = metadata or {}
        if namespace:
            metadata["namespace"] = namespace
        if tags:
            metadata["tags"] = list(sorted(set(tags)))
        chunks = self._chunk(text)
        out = []
        for i, c in enumerate(chunks):
            out.append(
                {
                    "id": f"{doc_id}:{i}",
                    "text": c,
                    "metadata": {**metadata, "order": i, "disabled": False},
                }
            )
        return ProcessedDoc(doc_id=doc_id, chunks=out)

    def process_file(self, path) -> ProcessedDoc:
        p = str(path)
        if p.lower().endswith(".txt"):
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                txt = f.read()
        else:
            # very naive: treat as binary -> ignore; real impl should parse pdf/docx
            with open(p, "rb") as f:
                raw = f.read()
            txt = raw.decode("utf-8", errors="ignore")
        return self.process_text(txt, metadata={"source_path": p})


# -------------------------
# Embeddings
# -------------------------

class EmbeddingManager:
    """Sentence embeddings with a hashing fallback. Singleton via get_embedding_manager()."""

    def __init__(self, model_name: str, device: str) -> None:
        self.model_name = model_name
        self.device = device
        self._backend = None  # sentence-transformers model
        self._dim = 384  # default fallback dim
        self._ensure_backend()

    def _ensure_backend(self):
        if self._backend is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer

            self._backend = SentenceTransformer(self.model_name, device=self.device)
            # try reading dimension
            try:
                self._dim = int(self._backend.get_sentence_embedding_dimension()) # type: ignore
            except Exception:
                pass
        except Exception:
            self._backend = None

    def get_dimension(self) -> int:
        return int(self._dim)

    def encode(self, texts: List[str]) -> np.ndarray:
        if self._backend is not None:
            vecs = self._backend.encode(texts, normalize_embeddings=True)
            return np.asarray(vecs, dtype=np.float32)

        # hashing fallback (stable)
        rng = np.random.RandomState(42)
        vecs = []
        for t in texts:
            h = hashlib.sha256(t.encode("utf-8", errors="ignore")).digest()
            # fold into dim
            dim = self._dim
            v = np.zeros(dim, dtype=np.float32)
            for i, b in enumerate(h):
                v[i % dim] += (b - 128) / 128.0
            # add small random to avoid duplicates
            v += rng.normal(0, 0.01, size=dim)
            # l2 normalize
            v = v / (np.linalg.norm(v) + 1e-8)
            vecs.append(v)
        return np.vstack(vecs)


_EMBED_SINGLETON: Optional[EmbeddingManager] = None


def get_embedding_manager() -> EmbeddingManager:
    global _EMBED_SINGLETON
    if _EMBED_SINGLETON is None:
        _EMBED_SINGLETON = EmbeddingManager(_cfg.embeddings.model_name, _cfg.embeddings.device)
    return _EMBED_SINGLETON


# -------------------------
# Vector store + BM25
# -------------------------

@dataclass
class _Chunk:
    id: str
    text: str
    meta: Dict[str, Any]
    vec: Optional[np.ndarray] = None


class _InMemoryIndex:
    """Simple in-memory index for semantic vectors and BM25-like lexical scores."""

    def __init__(self, embed: EmbeddingManager) -> None:
        self.embed = embed
        self.chunks: List[_Chunk] = []
        # per-doc stats
        self.docs: Dict[str, Dict[str, Any]] = {}  # doc_id -> {namespace,tags,count,created_at}
        # BM25 fields
        self._df: Dict[str, int] = {}
        self._tf: List[Dict[str, int]] = []
        self._avgdl: float = 0.0
        self._built: bool = False

    # ---- ingestion ----

    def add(self, doc: ProcessedDoc) -> int:
        n_before = len(self.chunks)
        # register doc meta
        ns = None
        tags: List[str] = []
        for c in doc.chunks:
            ns = c["metadata"].get("namespace", ns)
            if "tags" in c["metadata"]:
                tags.extend(c["metadata"]["tags"])
        tags = list(sorted(set(tags)))
        self.docs[doc.doc_id] = {
            "doc_id": doc.doc_id,
            "namespace": ns,
            "tags": tags,
            "count": len(doc.chunks),
            "created_at": time.time(),
        }
        # add chunks
        for c in doc.chunks:
            self.chunks.append(_Chunk(id=c["id"], text=c["text"], meta=c["metadata"]))
        self._built = False
        return len(self.chunks) - n_before

    def list_docs(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        vals = list(self.docs.values())
        if namespace:
            vals = [d for d in vals if d.get("namespace") == namespace]
        vals.sort(key=lambda x: (-x["count"], x["doc_id"]))
        return vals

    def delete_doc(self, doc_id: str) -> int:
        """Delete a whole document and its chunks."""
        before = len(self.chunks)
        self.chunks = [c for c in self.chunks if not c.id.startswith(f"{doc_id}:")]
        self.docs.pop(doc_id, None)
        self._built = False
        return before - len(self.chunks)

    def set_chunk_disabled(self, chunk_id: str, disabled: bool = True) -> bool:
        for c in self.chunks:
            if c.id == chunk_id:
                c.meta["disabled"] = bool(disabled)
                return True
        return False

    # ---- filters ----

    @staticmethod
    def _match_filters(c: _Chunk, namespace: Optional[str], tags_any: Optional[List[str]], tags_all: Optional[List[str]]) -> bool:
        if c.meta.get("disabled"):
            return False
        if namespace and c.meta.get("namespace") != namespace:
            return False
        tags = set(c.meta.get("tags", []) or [])
        if tags_any and not (tags & set(tags_any)):
            return False
        if tags_all and not set(tags_all).issubset(tags):
            return False
        return True

    # ---- semantic ----

    def _ensure_vectors(self, mask_indices: Optional[List[int]] = None):
        # encode only missing
        to_encode = []
        idx_map = []
        if mask_indices is None:
            itr = enumerate(self.chunks)
        else:
            itr = ((i, self.chunks[i]) for i in mask_indices)
        for i, c in itr:
            if c.vec is None:
                to_encode.append(c.text)
                idx_map.append(i)
        if not to_encode:
            return
        vecs = self.embed.encode(to_encode)
        for j, i in enumerate(idx_map):
            self.chunks[i].vec = vecs[j]

    def semantic_search(
        self,
        query: str,
        top_k: int = 6,
        namespace: Optional[str] = None,
        tags_any: Optional[List[str]] = None,
        tags_all: Optional[List[str]] = None,
    ) -> List[Tuple[int, float]]:
        if not self.chunks:
            return []
        mask = [i for i, c in enumerate(self.chunks) if self._match_filters(c, namespace, tags_any, tags_all)]
        if not mask:
            return []
        self._ensure_vectors(mask)
        qvec = self.embed.encode([query])[0]
        sims = []
        for i in mask:
            v = self.chunks[i].vec
            if v is None:
                continue
            score = float(np.dot(qvec, v) / (np.linalg.norm(qvec) * np.linalg.norm(v) + 1e-8))
            sims.append((i, score))
        sims.sort(key=lambda x: x[1], reverse=True)
        return sims[:top_k]

    # ---- bm25 ----

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return re.findall(r"\w+", text.lower())

    def _build_bm25(self):
        N = len(self.chunks)
        if N == 0:
            return
        self._df.clear()
        self._tf.clear()
        lengths = []
        for c in self.chunks:
            toks = self._tokenize(c.text)
            lengths.append(len(toks))
            freq: Dict[str, int] = {}
            for t in toks:
                freq[t] = freq.get(t, 0) + 1
            self._tf.append(freq)
            for t in freq.keys():
                self._df[t] = self._df.get(t, 0) + 1
        self._avgdl = (sum(lengths) / max(1, len(lengths))) if lengths else 0.0
        self._built = True

    def bm25_search(
        self,
        query: str,
        top_k: int = 6,
        namespace: Optional[str] = None,
        tags_any: Optional[List[str]] = None,
        tags_all: Optional[List[str]] = None,
        k1: float = 1.5,
        b: float = 0.75,
    ) -> List[Tuple[int, float]]:
        if not self.chunks:
            return []
        if not self._built:
            self._build_bm25()
        toks = self._tokenize(query)
        # mask
        mask = [i for i, c in enumerate(self.chunks) if self._match_filters(c, namespace, tags_any, tags_all)]
        if not mask:
            return []
        # compute
        N = len(self.chunks)
        scores = []
        for i in mask:
            tf = self._tf[i] if i < len(self._tf) else {}
            dl = sum(tf.values()) or 1
            s = 0.0
            for t in toks:
                f = tf.get(t, 0)
                if f == 0:
                    continue
                n_qi = self._df.get(t, 0)
                idf = math.log(1 + (N - n_qi + 0.5) / (n_qi + 0.5))
                denom = f + k1 * (1 - b + b * (dl / max(1.0, self._avgdl)))
                s += idf * (f * (k1 + 1)) / denom
            if s > 0:
                scores.append((i, s))
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

    # ---- hybrid ----

    def hybrid_search(
        self,
        query: str,
        top_k: int = 6,
        alpha: float = 0.7,
        namespace: Optional[str] = None,
        tags_any: Optional[List[str]] = None,
        tags_all: Optional[List[str]] = None,
    ) -> List[Tuple[int, float]]:
        sem = self.semantic_search(query, top_k=max(top_k, 20), namespace=namespace, tags_any=tags_any, tags_all=tags_all)
        bm = self.bm25_search(query, top_k=max(top_k, 20), namespace=namespace, tags_any=tags_any, tags_all=tags_all)
        def norm(lst):
            if not lst:
                return {}
            mx = max(s for _, s in lst)
            mn = min(s for _, s in lst)
            rng = (mx - mn) or 1.0
            return {i: (s - mn) / rng for i, s in lst}
        s_sem = norm(sem)
        s_bm = norm(bm)
        keys = set(s_sem.keys()) | set(s_bm.keys())
        fused = []
        for i in keys:
            score = alpha * s_sem.get(i, 0.0) + (1 - alpha) * s_bm.get(i, 0.0)
            fused.append((i, score))
        fused.sort(key=lambda x: x[1], reverse=True)
        return fused[:top_k]

    # ---- persistence helpers ----

    def export_json(self) -> Dict[str, Any]:
        return {
            "docs": list(self.docs.values()),
            "chunks": [
                {"id": c.id, "text": c.text, "meta": c.meta}
                for c in self.chunks
            ],
            "dim": self.embed.get_dimension(),
            "ts": time.time(),
            "version": 1,
        }

    def import_json(self, payload: Dict[str, Any]) -> None:
        docs = payload.get("docs", [])
        chunks = payload.get("chunks", [])
        self.docs = {d["doc_id"]: d for d in docs if "doc_id" in d}
        self.chunks = [_Chunk(id=c["id"], text=c["text"], meta=c.get("meta", {})) for c in chunks if "id" in c and "text" in c]
        self._built = False

# -------------------------
# Public RAG engine
# -------------------------

@dataclass
class RetrievalHit:
    id: str
    content: str
    score: float
    metadata: Dict[str, Any]

    def model_dump(self) -> Dict[str, Any]:
        return {"id": self.id, "content": self.content, "score": self.score, "metadata": self.metadata}


@dataclass
class RetrievalQuery:
    text: str
    top_k: int = 6
    mode: Literal["semantic", "bm25", "hybrid"] = "hybrid"
    alpha: float = 0.7  # hybrid weight
    namespace: Optional[str] = None
    tags_any: Optional[List[str]] = None
    tags_all: Optional[List[str]] = None


class ChineseRAGEngine:
    """
    A minimal yet capable RAG engine with local in-memory index.
    - add_document(ProcessedDoc)
    - search(RetrievalQuery)
    - list_docs / delete_doc / set_chunk_disabled
    - export_json / import_json
    """

    def __init__(self, embedding_manager: EmbeddingManager) -> None:
        self.embed = embedding_manager
        self.index = _InMemoryIndex(embedding_manager)

    # ingestion
    def add_document(self, processed: ProcessedDoc) -> List[RetrievalHit]:
        self.index.add(processed)
        return [RetrievalHit(id=c["id"], content=c["text"], score=0.0, metadata=c["metadata"]) for c in processed.chunks]

    # admin
    def list_documents(self, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.index.list_docs(namespace)

    def delete_document(self, doc_id: str) -> int:
        return self.index.delete_doc(doc_id)

    def set_chunk_disabled(self, chunk_id: str, disabled: bool = True) -> bool:
        return self.index.set_chunk_disabled(chunk_id, disabled)

    def export_json(self) -> Dict[str, Any]:
        return self.index.export_json()

    def import_json(self, payload: Dict[str, Any]) -> None:
        self.index.import_json(payload)

    # search
    def search(self, q: RetrievalQuery) -> List[RetrievalHit]:
        if q.top_k <= 0:
            return []
        if q.mode == "semantic":
            pairs = self.index.semantic_search(q.text, top_k=q.top_k, namespace=q.namespace, tags_any=q.tags_any, tags_all=q.tags_all)
        elif q.mode == "bm25":
            pairs = self.index.bm25_search(q.text, top_k=q.top_k, namespace=q.namespace, tags_any=q.tags_any, tags_all=q.tags_all)
        else:
            pairs = self.index.hybrid_search(q.text, top_k=q.top_k, alpha=q.alpha, namespace=q.namespace, tags_any=q.tags_any, tags_all=q.tags_all)

        hits: List[RetrievalHit] = []
        for i, score in pairs:
            c = self.index.chunks[i]
            hits.append(RetrievalHit(id=c.id, content=c.text, score=float(score), metadata=c.meta))
        return hits