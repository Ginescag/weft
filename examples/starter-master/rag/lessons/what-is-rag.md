# What is RAG

Retrieval-Augmented Generation grounds a language model in your documents. Instead of asking the model to answer from whatever it absorbed during training, you first *retrieve* the passages relevant to the question and paste them into the prompt; the model then *generates* an answer constrained by that context.

## The problem it solves

A model's parametric knowledge is frozen at training time, fuzzy about specifics, and silent about your private data. Three failure modes follow:

1. **Staleness** — it cannot know yesterday's meeting notes.
2. **Hallucination** — asked for specifics it never saw, it fabricates plausible text.
3. **Privacy walls** — your codebase and documents were never in the training set.

RAG addresses all three with the same move: put the true source text in front of the model at question time, and instruct it to answer *from the context*.

## The core loop

```
question → embed → search index → top-k chunks → prompt(context + question) → answer
```

Every stage can fail independently — bad chunking loses meaning, weak embeddings miss relevant passages, careless prompting lets the model ignore the context. This is why RAG is studied as a *system*, not a single technique.

## What RAG is not

- Not fine-tuning: no weights change; knowledge lives in the index, updatable in seconds.
- Not a guarantee against hallucination: it lowers the rate, but a model can still contradict its context.
- Not only for chatbots: summarisation, extraction, and agents all use the same pattern.
