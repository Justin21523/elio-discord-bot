import pytest

from app.services.persona_logic import persona_logic_reply


def test_persona_logic_basic():
  res = persona_logic_reply("Elio", "Hello from Earth", history=[], top_k=3, max_len=40)
  assert isinstance(res, dict)
  assert res.get("text")
  assert res.get("persona")
  assert res.get("strategy") in {"tfidf_markov", "no_corpus", "fallback"}


def test_persona_logic_with_history():
  history = [
    {"role": "user", "content": "Do you miss home?"},
    {"role": "assistant", "content": "I feel like home is among the stars."},
  ]
  res = persona_logic_reply("Elio", "What about your aunt?", history=history, top_k=3, max_len=50)
  assert res["text"]
  assert res["persona"]
  # ensure mood is present for debugging/observability
  assert res.get("mood") is not None
