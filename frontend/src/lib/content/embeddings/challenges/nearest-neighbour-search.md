# Challenge: brute-force nearest-neighbour search

Build the naive top-k search every vector database is trying to beat.

## Requirements

```
top_k(query: list[float], corpus: list[list[float]], k: int) -> list[tuple[int, float]]
```

1. Return the `k` corpus indices most similar to `query`, with their cosine scores.
2. Results sorted by score, descending; ties broken by lower index first.
3. `k` larger than the corpus → return the whole corpus ranked.
4. Do not modify the input lists.

## Example

```
corpus = [[1, 0], [0, 1], [0.7, 0.7]]
top_k([1, 0], corpus, 2)
# -> [(0, 1.0), (2, 0.707…)]
```

## Constraints

- Pure Python or NumPy, no FAISS/Annoy/hnswlib.
- One pass over the corpus; no repeated normalisation of the same vector.

## Stretch goal

Time it on 100k random 384-dim vectors. Then explain in one paragraph why approximate indexes (HNSW, IVF) exist — what exactly gets slow, and what do they trade away?
