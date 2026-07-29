# What are embeddings

An embedding is a fixed-length vector of numbers that represents a piece of text so that *semantic* similarity becomes *geometric* proximity. "Car" and "automobile" share almost no characters, yet their vectors sit close together; "car" and "carpet" share four characters and sit far apart.

## Where they come from

An embedding model is a neural network trained so that texts appearing in similar contexts map to nearby points. You feed it a string; it returns a vector — typically 384 to 3072 dimensions. The individual numbers mean nothing on their own. Only distances and angles between vectors carry information.

## Measuring closeness

The standard measure is **cosine similarity**: the cosine of the angle between two vectors.

- `1.0` — same direction, semantically near-identical
- `0.0` — orthogonal, unrelated
- `-1.0` — opposite (rare in practice with modern models)

Many models normalise vectors to unit length, making cosine similarity equal to the dot product — cheaper to compute at scale.

## Why they matter for retrieval

Keyword search finds documents that share *words* with the query. Embedding search finds documents that share *meaning*. Ask "how do I make my model stop inventing facts?" and a keyword engine finds nothing about "hallucination mitigation"; an embedding index does.

The catch: quality depends entirely on the model. A model trained on English prose will embed source code or legal text poorly. Check the training domain before trusting the geometry.
