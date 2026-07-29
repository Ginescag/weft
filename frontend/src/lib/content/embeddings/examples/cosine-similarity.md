# Cosine similarity from scratch

No libraries beyond NumPy — the whole measure in a dozen lines.

```python
import numpy as np

def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0.0:
        return 0.0  # convention: zero vector is similar to nothing
    return float(np.dot(a, b) / denom)
```

With toy vectors you can see the geometry directly:

```python
king  = np.array([0.9, 0.8, 0.1])
queen = np.array([0.88, 0.82, 0.12])
pizza = np.array([0.1, 0.2, 0.95])

cosine(king, queen)  # 0.999… — nearly parallel
cosine(king, pizza)  # 0.34  — wide angle
```

## The unit-norm shortcut

If every vector is pre-normalised to length 1, cosine similarity *is* the dot product:

```python
def normalise(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)

matrix = np.stack([normalise(v) for v in corpus_vectors])
scores = matrix @ normalise(query_vector)   # one matmul ranks the corpus
top_k = np.argsort(scores)[::-1][:5]
```

That single matrix multiplication is the entire "search engine" of a small RAG system — worth internalising before reaching for a vector database.
