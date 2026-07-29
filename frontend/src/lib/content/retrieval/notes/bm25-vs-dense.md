# BM25 vs dense — where each one won

Tested both on my mixed corpus (lecture notes + code snippets + two papers).

BM25 won on:

- Function names (`chunk_by_tokens`) and CLI flags — dense retrieval was hopeless here.
- Short queries of one or two rare words.

Dense won on:

- Questions phrased differently from the notes ("why does my model invent citations" → hallucination section).
- My Spanish queries against English content — bge-m3 crosses the language line, BM25 cannot.

Hybrid with RRF beat both individually on 9 of 12 test queries. The three losses were all identifier lookups where mixing in dense results diluted BM25's precision — worth trying a rule: if the query looks like an identifier (no spaces, has underscores/camelCase), skip dense entirely.
