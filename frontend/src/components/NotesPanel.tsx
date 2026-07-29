import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { BookOpen, PencilSimple, Plus } from '@phosphor-icons/react'
import { api } from '../lib/api'
import MarkdownView from './MarkdownView'
import { prettyName } from './ReaderTab'
import { EmptyState, ErrorState, Loading } from './ui'

interface NotesPanelProps {
  conceptId: string
  files: string[]
  /** Called after a note is created so the parent can refresh the listing. */
  onCreated: () => void
}

export default function NotesPanel({ conceptId, files, onCreated }: NotesPanelProps) {
  const [selected, setSelected] = useState<string | null>(files[0] ?? null)
  const [dialogOpen, setDialogOpen] = useState(false)
  /** The note that should open on the editing canvas (freshly created). */
  const [editOnOpen, setEditOnOpen] = useState<string | null>(null)

  // Auto-select the first note once the listing arrives. A freshly created
  // note may briefly be missing from the (stale) listing, so never clobber
  // an existing selection here — files only grow in this phase.
  useEffect(() => {
    if (!selected && files.length > 0) setSelected(files[0])
  }, [files, selected])

  const handleCreated = (file: string) => {
    setDialogOpen(false)
    setSelected(file)
    setEditOnOpen(file)
    onCreated()
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:flex-row md:gap-10">
      <aside className="shrink-0 md:w-52">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mb-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-hairline px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-linen-raw active:scale-[0.98]"
        >
          <Plus size={14} weight="bold" aria-hidden />
          New note
        </button>
        <ul className="flex flex-col gap-0.5">
          {files.map((file) => (
            <li key={file}>
              <button
                type="button"
                onClick={() => setSelected(file)}
                className={`w-full border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                  file === selected
                    ? 'border-burgundy bg-linen-bright font-medium text-ink'
                    : 'border-transparent text-muted hover:bg-linen-bright/60 hover:text-ink'
                }`}
              >
                {prettyName(file)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="mx-auto w-full min-w-0 max-w-4xl flex-1">
        {!selected ? (
          <EmptyState title="No notes pinned yet." hint="Click New note, name it, and write it on the canvas." />
        ) : (
          <NoteView
            key={`${conceptId}-${selected}`}
            conceptId={conceptId}
            file={selected}
            startInEdit={selected === editOnOpen}
          />
        )}
      </div>

      <NewNoteDialog conceptId={conceptId} open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />
    </div>
  )
}

/**
 * One note, Obsidian-style: a markdown canvas with autosave, and a reading
 * mode rendering the same file. Fresh notes land directly on the canvas.
 */
function NoteView({ conceptId, file, startInEdit }: { conceptId: string; file: string; startInEdit: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'read'>(startInEdit ? 'edit' : 'read')
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const saveTimer = useRef<number | undefined>(undefined)
  const latest = useRef({ text: '', status: 'saved' as string })
  latest.current = { text: text ?? '', status }

  useEffect(() => {
    let alive = true
    api
      .getFile(conceptId, 'notes', file)
      .then((c) => alive && setText(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [conceptId, file])

  // Flush a pending edit when the note (or tab) is left mid-debounce.
  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimer.current)
      if (latest.current.status === 'dirty') void api.saveNote(conceptId, file, latest.current.text)
    }
  }, [conceptId, file])

  const persist = async (body: string) => {
    window.clearTimeout(saveTimer.current)
    setStatus('saving')
    try {
      await api.saveNote(conceptId, file, body)
      setStatus('saved')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const onEdit = (value: string) => {
    setText(value)
    setStatus('dirty')
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void persist(value), 800)
  }

  if (error) return <ErrorState message={error} />
  if (text === null) return <Loading />

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-hairline pb-3">
        <p className="font-mono text-[11px] text-muted">notes/{file}</p>
        <div className="flex items-center gap-3">
          {mode === 'edit' && (
            <span className="font-mono text-[11px] text-muted" role="status">
              {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'}
            </span>
          )}
          <div className="flex divide-x divide-hairline overflow-hidden rounded-md border border-hairline">
            <button
              type="button"
              onClick={() => setMode('edit')}
              aria-label="Edit note"
              aria-pressed={mode === 'edit'}
              className={`p-1.5 transition-colors ${mode === 'edit' ? 'bg-linen-raw text-ink' : 'text-muted hover:text-ink'}`}
            >
              <PencilSimple size={14} weight={mode === 'edit' ? 'fill' : 'regular'} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setMode('read')}
              aria-label="Read note"
              aria-pressed={mode === 'read'}
              className={`p-1.5 transition-colors ${mode === 'read' ? 'bg-linen-raw text-ink' : 'text-muted hover:text-ink'}`}
            >
              <BookOpen size={14} weight={mode === 'read' ? 'fill' : 'regular'} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              void persist(text)
            }
          }}
          autoFocus={startInEdit}
          spellCheck={false}
          aria-label="Markdown canvas"
          placeholder="Write in markdown. It saves as you type."
          className="min-h-[65vh] w-full resize-none bg-transparent text-[16px] leading-relaxed text-ink outline-none placeholder:text-muted"
        />
      ) : (
        <MarkdownView markdown={text} />
      )}
    </div>
  )
}

function NewNoteDialog({
  conceptId,
  open,
  onOpenChange,
  onCreated,
}: {
  conceptId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (file: string) => void
}) {
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start each opening with a clean slate.
  useEffect(() => {
    if (open) {
      setTitle('')
      setError(null)
    }
  }, [open])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const { file } = await api.createNote(conceptId, title.trim(), '')
      onCreated(file)
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
        <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-hairline bg-linen-bright p-6 focus:outline-none">
          <Dialog.Title className="font-display text-lg font-semibold tracking-tight">New note</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Name it, then write it on the markdown canvas.
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim() !== '' && !creating) void create()
            }}
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note name"
              aria-label="Note name"
              className="mt-4 w-full rounded-md border border-hairline bg-linen px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
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
                disabled={creating || title.trim() === ''}
                className="rounded-md bg-burgundy px-4 py-2 text-sm font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creating ? 'Adding…' : 'Add note'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
