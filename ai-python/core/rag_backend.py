# -*- coding: utf-8 -*-
"""Factory to choose RAG backend based on config."""

from __future__ import annotations

from .config import get_config
from .rag import ChineseRAGEngine, get_embedding_manager
from .rag_avs import ChineseRAGEngineAVS

_cfg = get_config()

def get_rag_engine():
  if _cfg.mongo.rag_backend.lower() == "avs":
    return ChineseRAGEngineAVS(get_embedding_manager())
  return ChineseRAGEngine(get_embedding_manager())
