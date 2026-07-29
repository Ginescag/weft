import { useEffect, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { api } from '../lib/api'
import type { FlashcardsFile } from '../lib/types'
import { EmptyState, ErrorState, Loading } from './ui'

const FACE_CLASSES =
  'absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-xl border border-hairline bg-linen-bright p-10 text-center [backface-visibility:hidden]'

/** A stitched corner: the card is pinned to the linen like a swatch. */
function CornerStitch() {
  return <span aria-hidden className="absolute right-3 top-3 h-3.5 w-3.5 rounded-tr-md border-r border-t border-burgundy/35" />
}

interface FlashcardDeckProps {
  conceptId: string
}

export default function FlashcardDeck({ conceptId }: FlashcardDeckProps) {
  const [deck, setDeck] = useState<FlashcardsFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .getFlashcards(conceptId)
      .then((d) => alive && setDeck(d))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [conceptId])

  const total = deck?.tarjetas.length ?? 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (total === 0) return
      if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(i + 1, total - 1))
        setFlipped(false)
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(i - 1, 0))
        setFlipped(false)
      } else if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  if (error) return <ErrorState message={error} />
  if (!deck) return <Loading />
  if (total === 0)
    return <EmptyState title="No flashcards yet." hint="Cards for active recall will appear here once they are generated." />

  const card = deck.tarjetas[Math.min(index, total - 1)]

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
      <div className="w-full [perspective:1200px]">
        <motion.button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show front' : 'Show back'}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative min-h-[300px] w-full cursor-pointer [transform-style:preserve-3d]"
        >
          <span className={FACE_CLASSES} aria-hidden={flipped}>
            <CornerStitch />
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Front</span>
            <span key={card.id} className="rise font-display text-xl leading-snug">
              {card.anverso}
            </span>
          </span>
          <span className={`${FACE_CLASSES} [transform:rotateY(180deg)]`} aria-hidden={!flipped}>
            <CornerStitch />
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Back</span>
            <span key={card.id} className="rise text-lg leading-relaxed">
              {card.reverso}
            </span>
          </span>
        </motion.button>
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => {
            setIndex((i) => Math.max(i - 1, 0))
            setFlipped(false)
          }}
          disabled={index === 0}
          aria-label="Previous card"
          className="rounded-md border border-hairline p-2 text-ink transition-colors hover:bg-linen-raw active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <span className="font-mono text-sm text-muted">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => {
            setIndex((i) => Math.min(i + 1, total - 1))
            setFlipped(false)
          }}
          disabled={index === total - 1}
          aria-label="Next card"
          className="rounded-md border border-hairline p-2 text-ink transition-colors hover:bg-linen-raw active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>

      <p className="flex items-center gap-3 text-xs text-muted">
        <span>
          <kbd>Space</kbd> flip
        </span>
        <span>
          <kbd>←</kbd> <kbd>→</kbd> navigate
        </span>
      </p>
    </div>
  )
}
