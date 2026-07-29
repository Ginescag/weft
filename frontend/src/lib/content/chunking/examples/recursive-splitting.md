# Recursive splitting, by hand

A minimal recursive splitter in Python. It walks a separator hierarchy and only descends when a piece is still too long.

```python
SEPARATORS = ["\n\n", "\n", ". ", " "]

def split(text: str, max_len: int, seps: list[str] = SEPARATORS) -> list[str]:
    if len(text) <= max_len:
        return [text]
    if not seps:
        # No separators left: hard cut.
        return [text[i:i + max_len] for i in range(0, len(text), max_len)]

    sep, rest = seps[0], seps[1:]
    pieces, current = [], ""

    for part in text.split(sep):
        candidate = current + sep + part if current else part
        if len(candidate) <= max_len:
            current = candidate
        else:
            if current:
                pieces.append(current)
            # The part itself may still be too long: recurse deeper.
            pieces.extend(split(part, max_len, rest) if len(part) > max_len else [part])
            current = ""

    if current:
        pieces.append(current)
    return pieces
```

Try it on a README: with `max_len=400` you will see paragraphs kept whole, and only pathological lines (tables, minified code) falling through to the sentence and word levels.

Two details worth copying in real implementations:

- Reattach the separator when accumulating, or you silently lose newlines.
- Handle the "single part longer than `max_len`" case explicitly — it is the most common bug in hand-rolled splitters.
