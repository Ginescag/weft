# A minimal RAG in 40 lines

Everything essential, nothing optional: array as index, cosine as search, one prompt template.

```python
import numpy as np

# --- indexing time -----------------------------------------------
chunks: list[str] = chunk_documents(load_corpus(), size=512, overlap=64)
index = np.stack([normalise(embed(c)) for c in chunks])

# --- query time --------------------------------------------------
def answer(question: str, k: int = 4) -> str:
    q = normalise(embed(question))
    scores = index @ q                        # cosine over the whole corpus
    top = np.argsort(scores)[::-1][:k]
    context = "\n\n---\n\n".join(chunks[i] for i in top)

    prompt = (
        "Answer using ONLY the context below. "
        "If the context is not enough, say \"I don't know\".\n\n"
        f"# Context\n{context}\n\n# Question\n{question}"
    )
    return llm(prompt)
```

## What to notice

- The index is a NumPy matrix. Vector databases earn their place at ~1M vectors or with filtering needs — not before.
- `embed` appears at both indexing and query time. Same model, same version, always.
- The refusal instruction ("say I don't know") is load-bearing: without it the model pads thin context with invention.
- The `---` separators keep chunk boundaries visible to the model — sloppy prompt assembly measurably hurts answers.

Swap each piece for a heavier one only when this baseline demonstrably fails on your own evaluation questions.
