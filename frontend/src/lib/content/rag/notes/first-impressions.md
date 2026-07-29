# First impressions

Read both lessons before having the prerequisites — which is exactly why this node is blocked. Notes to my future self for when chunking and retrieval are done:

- The two-lives framing (indexing time vs query time) finally made the architecture click. Everything slow goes offline; query time is just embed → matmul → prompt.
- "The chunker decides what can ever be found" — write this on the wall.
- I keep wanting to reach for a vector DB first. The minimal example says: array + matmul until 1M vectors. Resist.

Question for later: how do I *measure* that my RAG improved after a change, beyond vibes? Look up evaluation sets — seems like the real difference between tinkering and engineering.
