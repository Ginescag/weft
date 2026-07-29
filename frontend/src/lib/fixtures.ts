import type {
  FlashcardsFile,
  RelationType,
  TestsFile,
} from './types'

// Markdown content lives in real .md files so it stays authorable;
// Vite inlines them as strings via ?raw.
import chunkingStrategies from './content/chunking/lessons/chunking-strategies.md?raw'
import recursiveSplitting from './content/chunking/examples/recursive-splitting.md?raw'
import implementAChunker from './content/chunking/challenges/implement-a-chunker.md?raw'
import chunkSizeExperiments from './content/chunking/notes/chunk-size-experiments.md?raw'

import whatAreEmbeddings from './content/embeddings/lessons/what-are-embeddings.md?raw'
import cosineSimilarity from './content/embeddings/examples/cosine-similarity.md?raw'
import nearestNeighbourSearch from './content/embeddings/challenges/nearest-neighbour-search.md?raw'
import modelChoices from './content/embeddings/notes/model-choices.md?raw'

import retrievalBasics from './content/retrieval/lessons/retrieval-basics.md?raw'
import hybridSearch from './content/retrieval/examples/hybrid-search.md?raw'
import rerankTheResults from './content/retrieval/challenges/rerank-the-results.md?raw'
import bm25VsDense from './content/retrieval/notes/bm25-vs-dense.md?raw'

import whatIsRag from './content/rag/lessons/what-is-rag.md?raw'
import ragPipeline from './content/rag/lessons/rag-pipeline.md?raw'
import minimalRag from './content/rag/examples/minimal-rag.md?raw'
import buildAToyRag from './content/rag/challenges/build-a-toy-rag.md?raw'
import firstImpressions from './content/rag/notes/first-impressions.md?raw'

export interface ConceptFixture {
  id: string
  nombre: string
  ruta: string
  /** Short summary shown in the graph hover card and search results. */
  resumen: string
  /** Prerequisites of this concept, as in the on-disk .meta files. */
  relaciones: { id: string; tipo: RelationType }[]
  lessons: Record<string, string>
  examples: Record<string, string>
  challenges: Record<string, string>
  notes: Record<string, string>
  tests: TestsFile
  flashcards: FlashcardsFile
}

export const concepts: Record<string, ConceptFixture> = {
  chunking: {
    id: 'chunking',
    nombre: 'Chunking',
    ruta: 'chunking',
    resumen:
      'Cutting raw documents into retrievable units of meaning: fixed windows, recursive separators, semantic boundaries. The chunker decides what can ever be found.',
    relaciones: [],
    lessons: { 'chunking-strategies.md': chunkingStrategies },
    examples: { 'recursive-splitting.md': recursiveSplitting },
    challenges: { 'implement-a-chunker.md': implementAChunker },
    notes: { 'chunk-size-experiments.md': chunkSizeExperiments },
    tests: {
      preguntas: [
        {
          id: 'q1',
          enunciado: 'What problem does semantic chunking solve over fixed-size chunking?',
          opciones: [
            'It reduces storage cost',
            'It keeps complete units of meaning together',
            'It speeds up model inference',
            'It removes the need for embeddings',
          ],
          correcta: 1,
          explicacion:
            'Semantic chunking cuts at meaning boundaries instead of length boundaries, so a definition or argument is not split across chunks.',
        },
        {
          id: 'q2',
          enunciado: 'In a sliding-window chunker, what is the stride between window starts?',
          opciones: ['size + overlap', 'size - overlap', 'overlap - size', 'size / overlap'],
          correcta: 1,
          explicacion:
            'Each new window advances by size − overlap tokens; that is why overlap must be strictly smaller than size.',
        },
        {
          id: 'q3',
          enunciado: 'Why does recursive chunking try paragraph separators before sentence separators?',
          opciones: [
            'Paragraphs compress better',
            'It minimises the number of chunks',
            'Larger natural boundaries preserve more structure, descending only when needed',
            'Sentence splitting is not deterministic',
          ],
          correcta: 2,
          explicacion:
            'The hierarchy respects the largest natural unit that still fits, only descending to finer separators for oversized pieces.',
        },
        {
          id: 'q4',
          enunciado: 'Which question type generally favours small chunks?',
          opciones: [
            'Broad explanatory questions',
            'Precise factual lookups',
            'Multi-document summaries',
            'Opinion questions',
          ],
          correcta: 1,
          explicacion:
            'Small chunks give precise matches for factual lookups; explanatory questions need larger chunks with surrounding context.',
        },
      ],
    },
    flashcards: {
      tarjetas: [
        { id: 'f1', anverso: 'What decides "what can ever be found" in a RAG system?', reverso: 'The chunker: a chunk is the smallest retrievable unit of meaning.' },
        { id: 'f2', anverso: 'Typical overlap for fixed/recursive chunking?', reverso: '10-20% of the chunk size, to soften losses at boundaries.' },
        { id: 'f3', anverso: 'Recursive chunking in one sentence', reverso: 'Split on a hierarchy of separators (paragraph → sentence → word), descending only when a piece is still too large.' },
        { id: 'f4', anverso: 'Most common bug in hand-rolled splitters?', reverso: 'Not handling a single part longer than max_len (must recurse or hard-cut it).' },
        { id: 'f5', anverso: 'When does semantic chunking cut?', reverso: 'Where similarity between consecutive segments drops, i.e. at topic shifts.' },
      ],
    },
  },

  embeddings: {
    id: 'embeddings',
    nombre: 'Embeddings',
    ruta: 'embeddings',
    resumen:
      'Dense vectors that place text in a shared semantic space, so similarity becomes geometry. The foundation under every retrieval step.',
    relaciones: [{ id: 'chunking', tipo: 'relacionado_con' }],
    lessons: { 'what-are-embeddings.md': whatAreEmbeddings },
    examples: { 'cosine-similarity.md': cosineSimilarity },
    challenges: { 'nearest-neighbour-search.md': nearestNeighbourSearch },
    notes: { 'model-choices.md': modelChoices },
    tests: {
      preguntas: [
        {
          id: 'q1',
          enunciado: 'What property makes embeddings useful for search?',
          opciones: [
            'They compress text losslessly',
            'Semantic similarity becomes geometric proximity',
            'They are unique per document',
            'They encode exact word positions',
          ],
          correcta: 1,
          explicacion:
            'Texts with similar meaning map to nearby vectors, so meaning can be compared with distances and angles.',
        },
        {
          id: 'q2',
          enunciado: 'When does cosine similarity equal the dot product?',
          opciones: [
            'Always',
            'When vectors are normalised to unit length',
            'When vectors are orthogonal',
            'Only in two dimensions',
          ],
          correcta: 1,
          explicacion:
            'cos(a,b) = a·b / (|a||b|); with unit-norm vectors the denominator is 1, leaving just the dot product.',
        },
        {
          id: 'q3',
          enunciado: 'You switch embedding models. What must happen to the index?',
          opciones: [
            'Nothing, vectors are compatible',
            'Only new documents need the new model',
            'Everything must be re-embedded with the new model',
            'Just renormalise the old vectors',
          ],
          correcta: 2,
          explicacion:
            'Vectors from different models live in unrelated spaces; mixing them silently breaks similarity search.',
        },
        {
          id: 'q4',
          enunciado: 'Embedding search beats keyword search primarily at…',
          opciones: [
            'Finding exact identifiers like UUIDs',
            'Matching paraphrases and meaning',
            'Latency on huge corpora',
            'Handling typos',
          ],
          correcta: 1,
          explicacion:
            'Dense retrieval matches meaning rather than shared words; exact identifiers are where it is weakest.',
        },
      ],
    },
    flashcards: {
      tarjetas: [
        { id: 'f1', anverso: 'What is an embedding?', reverso: 'A fixed-length vector representing text such that semantic similarity becomes geometric proximity.' },
        { id: 'f2', anverso: 'Cosine similarity of identical direction / orthogonal vectors?', reverso: '1.0 for same direction, 0.0 for orthogonal (unrelated).' },
        { id: 'f3', anverso: 'Do individual embedding dimensions mean anything?', reverso: 'No. Only distances and angles between vectors carry information.' },
        { id: 'f4', anverso: 'The unit-norm shortcut', reverso: 'Pre-normalise all vectors; then one matrix multiplication ranks the whole corpus by cosine.' },
        { id: 'f5', anverso: 'Danger of mixing vectors from two models', reverso: 'They live in different spaces; search silently degrades to noise. Re-embed everything.' },
      ],
    },
  },

  retrieval: {
    id: 'retrieval',
    nombre: 'Retrieval',
    ruta: 'retrieval',
    resumen:
      'Finding the right chunks for a query: dense similarity, BM25, hybrid scoring and reranking. Quality here caps the quality of everything downstream.',
    relaciones: [{ id: 'embeddings', tipo: 'requiere' }],
    lessons: { 'retrieval-basics.md': retrievalBasics },
    examples: { 'hybrid-search.md': hybridSearch },
    challenges: { 'rerank-the-results.md': rerankTheResults },
    notes: { 'bm25-vs-dense.md': bm25VsDense },
    tests: {
      preguntas: [
        {
          id: 'q1',
          enunciado: 'Why does Reciprocal Rank Fusion use rank positions instead of raw scores?',
          opciones: [
            'Ranks are faster to compute',
            'BM25 and cosine scores live on incomparable scales',
            'Ranks weight recent documents higher',
            'Raw scores are usually negative',
          ],
          correcta: 1,
          explicacion:
            'RRF sidesteps score normalisation entirely: only the position of a document in each ranked list matters.',
        },
        {
          id: 'q2',
          enunciado: 'Where is sparse retrieval (BM25) clearly stronger than dense?',
          opciones: [
            'Paraphrased questions',
            'Cross-lingual queries',
            'Exact identifiers, names and error codes',
            'Conceptual questions',
          ],
          correcta: 2,
          explicacion:
            'BM25 matches exact terms, which is precisely what identifiers and codes need; dense vectors embed them meaninglessly.',
        },
        {
          id: 'q3',
          enunciado: 'What does retrieve-then-rerank buy you?',
          opciones: [
            'Lower indexing cost',
            'A fast broad candidate pull, then an accurate slow reorder of just the top',
            'No need for embeddings',
            'Deterministic results',
          ],
          correcta: 1,
          explicacion:
            'A cheap retriever casts a wide net (large k); an expensive cross-encoder reorders only those candidates before keeping a handful.',
        },
        {
          id: 'q4',
          enunciado: 'Symptom of k (top-k) set too large?',
          opciones: [
            'The answer is missing from the prompt',
            'The answer is buried among near-duplicates and noise',
            'Queries fail to embed',
            'The index grows unbounded',
          ],
          correcta: 1,
          explicacion:
            'Too many chunks dilute the context with noise; too few risks leaving the answer out entirely.',
        },
      ],
    },
    flashcards: {
      tarjetas: [
        { id: 'f1', anverso: 'The one question retrieval answers', reverso: 'Given a query, which chunks deserve to enter the prompt?' },
        { id: 'f2', anverso: 'RRF formula (per document, per list)', reverso: 'score += 1 / (k + rank), with k ≈ 60; sum over the lists where it appears.' },
        { id: 'f3', anverso: 'Why k = 60 in RRF?', reverso: 'It flattens the head of each list, so consensus across retrievers beats a single-list winner.' },
        { id: 'f4', anverso: 'Hybrid retrieval in one line', reverso: 'Run sparse (BM25) and dense (embeddings) in parallel, then merge by rank fusion.' },
      ],
    },
  },

  rag: {
    id: 'rag',
    nombre: 'RAG',
    ruta: 'rag',
    resumen:
      'Retrieval-augmented generation: ground the model in retrieved context so answers cite the corpus instead of inventing it. The capstone that ties the other concepts together.',
    relaciones: [
      { id: 'chunking', tipo: 'requiere' },
      { id: 'retrieval', tipo: 'requiere' },
    ],
    lessons: {
      'what-is-rag.md': whatIsRag,
      'rag-pipeline.md': ragPipeline,
    },
    examples: { 'minimal-rag.md': minimalRag },
    challenges: { 'build-a-toy-rag.md': buildAToyRag },
    notes: { 'first-impressions.md': firstImpressions },
    tests: {
      preguntas: [
        {
          id: 'q1',
          enunciado: 'Which three failure modes of parametric knowledge does RAG address?',
          opciones: [
            'Latency, cost, context length',
            'Staleness, hallucination, privacy walls',
            'Bias, toxicity, refusals',
            'Overfitting, underfitting, drift',
          ],
          correcta: 1,
          explicacion:
            'RAG puts true, current, private source text in front of the model at question time, attacking staleness, fabrication and the privacy wall at once.',
        },
        {
          id: 'q2',
          enunciado: 'What distinguishes indexing time from query time?',
          opciones: [
            'Indexing is online and latency-bound; query is offline',
            'Indexing is offline and can be slow; query time is online and latency-bound',
            'They must run on different machines',
            'Indexing uses the LLM; query time does not',
          ],
          correcta: 1,
          explicacion:
            'Load/chunk/embed/store happens offline in batch; embed-query/retrieve/prompt/generate happens per request under latency pressure.',
        },
        {
          id: 'q3',
          enunciado: 'Why must the query be embedded with the same model used at indexing time?',
          opciones: [
            'Licences usually require it',
            'Different models produce vectors in unrelated spaces, so search degrades to noise',
            'The index stores the model weights',
            'Only that model can normalise vectors',
          ],
          correcta: 1,
          explicacion:
            'Similarity only means something within one embedding space; cross-model comparisons are geometrically meaningless.',
        },
        {
          id: 'q4',
          enunciado: 'Does RAG change the model weights?',
          opciones: [
            'Yes, lightly, at query time',
            'Yes, during indexing',
            'No. Knowledge lives in the index and is updatable in seconds',
            'Only when fine-tuning is enabled',
          ],
          correcta: 2,
          explicacion:
            'RAG is not fine-tuning: the model is frozen; updating knowledge means updating the index.',
        },
        {
          id: 'q5',
          enunciado: 'Answers keep ignoring your documents. Per the failure checklist, what do you inspect first?',
          opciones: [
            'The GPU utilisation',
            'The retrieved chunks that were actually put in the prompt',
            'The model temperature',
            'The number of index shards',
          ],
          correcta: 1,
          explicacion:
            'Log and read what retrieval returned and what prompt assembly did with it; that is where "ignoring the documents" is usually born.',
        },
      ],
    },
    flashcards: {
      tarjetas: [
        { id: 'f1', anverso: 'RAG in one sentence', reverso: 'Retrieve the passages relevant to a question and generate an answer constrained by that context.' },
        { id: 'f2', anverso: 'The core loop', reverso: 'question → embed → search index → top-k chunks → prompt(context + question) → answer.' },
        { id: 'f3', anverso: 'Is RAG a guarantee against hallucination?', reverso: 'No. It lowers the rate, but a model can still contradict its context.' },
        { id: 'f4', anverso: 'The two lives of a pipeline', reverso: 'Indexing time (offline: load, chunk, embed, store) and query time (online: retrieve, assemble, generate).' },
        { id: 'f5', anverso: 'Load-bearing prompt instruction', reverso: 'Answer only from the context; say "I don’t know" when the context is not enough.' },
        { id: 'f6', anverso: 'When does a vector database earn its place?', reverso: 'Around a million vectors, or when you need filtering. Before that, an array and a matmul suffice.' },
      ],
    },
  },
}
