# Anatomy of a RAG pipeline

A production pipeline has two lives: **indexing time** (offline, batch) and **query time** (online, latency-bound). Confusing the two is the most common architectural mistake.

## Indexing time

1. **Load** — pull documents from their sources; keep origin metadata (path, page, date).
2. **Chunk** — split into retrievable units. The chunker decides what can ever be found.
3. **Embed** — one vector per chunk, all from the same model.
4. **Store** — vectors plus metadata into an index. For small corpora, an array and a matmul suffice.

Re-run this whenever documents change. Everything here can be slow and thorough.

## Query time

1. **Embed the query** — with the *same* model used at indexing time. Mismatched models produce vectors in unrelated spaces; search silently degrades to noise.
2. **Retrieve** — top-k by similarity, optionally hybrid (BM25 + dense) with rank fusion.
3. **Rerank** (optional) — a cross-encoder reorders a generous candidate set; keep the best few.
4. **Assemble the prompt** — context first, clearly delimited, then the question, plus an instruction to answer only from the context and to say "I don't know" otherwise.
5. **Generate** — and, in serious systems, cite: ask the model to reference chunk ids so answers are auditable.

## Failure checklist

- Answers ignore your documents → prompt assembly or retrieval is broken; log the retrieved chunks and read them.
- Right document never retrieved → chunking or embedding model mismatch.
- Answers correct but truncated → chunks too small, or k too small.
- Latency spikes → reranker or oversized k at query time; move cost to indexing time.
