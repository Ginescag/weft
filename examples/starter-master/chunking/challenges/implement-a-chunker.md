# Challenge: implement a sliding-window chunker

Write a function that splits a text into overlapping windows of tokens.

## Requirements

```
chunk(text: str, size: int, overlap: int) -> list[str]
```

1. Tokenise naively by whitespace — no external tokeniser.
2. Each chunk holds at most `size` tokens.
3. Consecutive chunks share exactly `overlap` tokens.
4. Raise an error when `overlap >= size` (the window would never advance).
5. The final chunk may be shorter, but must never be empty.

## Example

```
chunk("a b c d e f g", size=3, overlap=1)
# -> ["a b c", "c d e", "e f g"]
```

## Edge cases to cover

- Text shorter than `size` → one chunk, unchanged.
- `overlap = 0` → disjoint windows.
- Trailing window smaller than `overlap` → do not emit a duplicate.

## Hint

The stride between window starts is `size - overlap`. Compute the start indices first (`range(0, n, stride)`) and slice; do not try to walk the list while mutating it.
