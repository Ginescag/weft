# Challenge: rerank the results

You have a fast retriever that returns 20 candidates, of which only a few are truly relevant. Build the reranking stage.

## Requirements

```
rerank(query: str, candidates: list[str], scorer, keep: int) -> list[str]
```

1. `scorer(query, passage)` is a provided black-box returning a float — treat it as expensive (one call per candidate, no more).
2. Return the `keep` best passages, in descending score order.
3. Preserve the original candidate order for exact ties.
4. `keep >= len(candidates)` → return all candidates, reranked.

## The interesting part

Add a `budget` parameter: the maximum number of scorer calls allowed. When `budget < len(candidates)`, decide which candidates deserve scoring — the rest keep their retriever order below the scored ones.

Write one paragraph justifying your budget strategy. (Scoring the *top* of the retriever list first is reasonable — but is it optimal when the retriever is known to be noisy?)

## Verify

With `scorer = lambda q, p: len(set(q.split()) & set(p.split()))` (word overlap), query `"tension in the thread"`, and candidates you invent, check that a passage sharing three words outranks one sharing one word regardless of retriever position.
