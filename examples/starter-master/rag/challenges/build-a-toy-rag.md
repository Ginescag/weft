# Challenge: build a toy RAG end to end

Assemble the whole loop over a corpus you know well — your own notes for this course.

## Requirements

1. **Corpus**: at least 10 markdown files of your own notes.
2. **Chunking**: your sliding-window chunker from the chunking challenge (`size=512`, `overlap=64`).
3. **Index**: brute-force cosine over normalised vectors — your nearest-neighbour search from the embeddings challenge.
4. **Generation**: any local model via an OpenAI-compatible endpoint. The prompt must instruct the model to answer only from context and refuse otherwise.
5. **Interface**: a CLI — `python rag.py "your question"` prints the answer *and* the file names of the chunks used.

## Acceptance test

Write 5 questions whose answers you can point to in your notes, and 2 questions your notes cannot answer.

- The 5 answerable ones: answer must be correct and cite the right file.
- The 2 unanswerable ones: the system must say it does not know — a fabricated answer is a failing grade for the whole exercise.

## Constraints

- No LangChain, no LlamaIndex, no vector database. Every moving part must be code you wrote and can explain.
- Total under 150 lines excluding the corpus.

## Stretch goal

Log the top-10 retrieved chunks for every question. For one failure, write three sentences diagnosing *which stage* lost the answer: chunking, retrieval, or generation.
