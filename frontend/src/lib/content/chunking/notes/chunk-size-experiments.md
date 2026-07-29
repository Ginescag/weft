# Chunk size experiments

Ran the recursive splitter over my course notes at three sizes and eyeballed retrieval quality with ten test questions.

- **256 tokens** — precise answers to definition questions, but explanatory answers arrive truncated. 7/10.
- **512 tokens** — the sweet spot for this corpus. 9/10.
- **1024 tokens** — answers drown in surrounding context; two retrievals missed entirely. 6/10.

Overlap at 15% fixed both boundary misses I saw at 512 without measurably slowing anything.

Remember: results are corpus-specific. Re-run this when switching from notes to papers.
