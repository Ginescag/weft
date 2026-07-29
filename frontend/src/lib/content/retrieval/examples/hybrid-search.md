# Hybrid search with Reciprocal Rank Fusion

RRF merges ranked lists using only positions — no score normalisation needed.

```python
def rrf(rankings: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    """Merge ranked lists of doc ids. k dampens the head of each list."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for position, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + position + 1)
    return sorted(scores.items(), key=lambda item: -item[1])
```

Wired into a two-retriever setup:

```python
bm25_hits  = bm25_index.search(query, n=20)      # ["doc7", "doc2", ...]
dense_hits = vector_index.search(query, n=20)    # ["doc2", "doc9", ...]

merged = rrf([bm25_hits, dense_hits])
context = [store[doc_id] for doc_id, _ in merged[:5]]
```

## Why k=60 works

With `k=60`, the difference between rank 1 and rank 2 is small (`1/61` vs `1/62`) — so a document appearing in *both* lists at modest positions beats a document topping only one list. Lower `k` makes single-list winners dominate; raise it and consensus dominates. Sixty is the published default and rarely worth tuning first.

Try deleting one of the two retrievers and re-running your evaluation set: hybrid usually wins on corpora that mix prose with identifiers, tables, or code.
