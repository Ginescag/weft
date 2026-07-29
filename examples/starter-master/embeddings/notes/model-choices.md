# Model choices

Shortlist after reading the MTEB leaderboard and testing locally:

- **all-MiniLM-L6-v2** — 384 dims, tiny, runs anywhere. My default for experiments.
- **bge-m3** — multilingual, handles my Spanish notes and English papers in the same index. Noticeably better cross-language recall.
- **text-embedding-3-small** — best quality of the three but means sending study material to an API.

Decision for now: bge-m3 through Ollama. Local, multilingual, good enough.

Open question: do I need to re-embed everything when I switch models? Yes — vectors from different models live in different spaces. Mixing them silently breaks search. Painful lesson, one evening lost.
