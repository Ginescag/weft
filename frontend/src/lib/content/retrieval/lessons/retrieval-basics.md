# Retrieval basics

Retrieval answers one question: *given a query, which chunks deserve to enter the prompt?* Everything else in RAG depends on getting this ranking right.

## Sparse retrieval

Classic keyword search — BM25 being the standard. It scores a document by how often query terms appear in it, discounted by how common those terms are in the corpus. Strengths: exact matches, names, error codes, acronyms. Weakness: zero tolerance for paraphrase. "Fix hallucinations" will not find "reducing fabricated answers".

## Dense retrieval

Embed the query, embed the chunks, rank by cosine similarity. Strengths: paraphrase, cross-lingual matching, conceptual questions. Weaknesses: exact identifiers (a UUID embeds meaninglessly), and it inherits every bias of the embedding model.

## Hybrid retrieval

Run both, then merge. The usual merger is **Reciprocal Rank Fusion**: each document scores by its *rank position* in each list, not its raw score — which sidesteps the problem that BM25 scores and cosine scores live on incomparable scales.

## Top-k and its discontents

You retrieve the k best chunks, but k is a blunt instrument:

- k too small → the answer is not in the prompt at all.
- k too large → the answer is buried among near-duplicates and noise.

A common refinement is retrieve-then-**rerank**: pull a generous candidate set (k=50) with a fast retriever, then let a slower, more accurate cross-encoder reorder the top of the list before keeping the final handful.
