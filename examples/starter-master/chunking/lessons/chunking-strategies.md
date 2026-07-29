# Chunking strategies

Before a document can be retrieved, it has to be cut into pieces small enough to embed and rank. How you cut decides what the retriever can ever find: a chunk is the smallest unit of meaning your system knows about.

## Fixed-size chunking

Split every `N` characters (or tokens), usually with some overlap. Trivial to implement and fast, but it cuts sentences and ideas mid-thought. A definition split across two chunks may match neither query.

## Recursive chunking

Split on a hierarchy of separators — paragraphs first, then sentences, then words — only descending when a piece is still too large. This respects natural boundaries most of the time and is the default in most frameworks.

## Semantic chunking

Embed candidate segments and cut where the topic shifts: when the similarity between consecutive sentences drops below a threshold, start a new chunk. More expensive (you embed twice), but chunks hold complete units of meaning.

## Choosing sizes

| Strategy | Typical size | Strength | Weakness |
| --- | --- | --- | --- |
| Fixed | 256–512 tokens | Cheap, predictable | Breaks meaning |
| Recursive | 200–800 tokens | Respects structure | Needs good separators |
| Semantic | Variable | Coherent units | Costly, threshold-sensitive |

Overlap of 10–20% softens boundary losses in fixed and recursive schemes. Semantic chunking rarely needs it.

The right size depends on the questions you expect: precise factual lookups favour small chunks; explanatory questions favour larger ones with more context.
