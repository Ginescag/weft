import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { api } from '../lib/api'
import type { GraphNode } from '../lib/types'

interface NewConceptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The concept was created; the parent pins the returned node on the linen. */
  onCreated: (node: GraphNode) => void
}

export default function NewConceptDialog({ open, onOpenChange, onCreated }: NewConceptDialogProps) {
  const [nombre, setNombre] = useState('')
  const [resumen, setResumen] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start each opening with a clean slate.
  useEffect(() => {
    if (open) {
      setNombre('')
      setResumen('')
      setError(null)
    }
  }, [open])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const node = await api.createConcept(nombre.trim(), resumen.trim())
      onCreated(node)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-hairline bg-linen-bright p-6 focus:outline-none">
          <Dialog.Title className="font-display text-lg font-semibold tracking-tight">
            Add concept
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Pin a new needle on the linen. Thread its relations by dragging on the graph.
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (nombre.trim() !== '' && !creating) void create()
            }}
          >
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Concept name"
              aria-label="Concept name"
              className="mt-4 w-full rounded-md border border-hairline bg-linen px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
            />
            <textarea
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              rows={3}
              placeholder="Short summary (optional), shown on hover and in search"
              aria-label="Concept summary"
              className="mt-3 w-full resize-none rounded-md border border-hairline bg-linen px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
            />
            {error && <p className="mt-2 text-sm text-burgundy">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={creating || nombre.trim() === ''}
                className="rounded-md bg-burgundy px-4 py-2 text-sm font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creating ? 'Pinning…' : 'Add concept'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
