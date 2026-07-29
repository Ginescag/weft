import { useEffect, useState } from 'react'
import { FloppyDisk } from '@phosphor-icons/react'
import { api } from '../lib/api'
import MarkdownView from './MarkdownView'
import { prettyName } from './ReaderTab'
import { EmptyState, ErrorState, Loading } from './ui'

const draftKey = (conceptId: string, file: string) => `telar.draft.${conceptId}.${file}`

interface ChallengePanelProps {
  conceptId: string
  files: string[]
}

export default function ChallengePanel({ conceptId, files }: ChallengePanelProps) {
  const [selected, setSelected] = useState<string | null>(files[0] ?? null)

  if (files.length === 0) {
    return (
      <EmptyState
        title="No challenges set."
        hint="Exercises for this concept will appear here once they are generated."
      />
    )
  }

  return (
    <div>
      {files.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {files.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => setSelected(file)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                file === selected
                  ? 'border-burgundy/50 bg-burgundy/5 font-medium text-ink'
                  : 'border-hairline text-muted hover:text-ink'
              }`}
            >
              {prettyName(file)}
            </button>
          ))}
        </div>
      )}
      {selected && <Challenge key={`${conceptId}-${selected}`} conceptId={conceptId} file={selected} />}
    </div>
  )
}

function Challenge({ conceptId, file }: { conceptId: string; file: string }) {
  const [statement, setStatement] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([api.getFile(conceptId, 'challenges', file), api.getSolution(conceptId, file)])
      .then(([md, solution]) => {
        if (!alive) return
        setStatement(md)
        setSaved(solution)
        // Draft (work in progress) wins over the last saved solution.
        const draft = localStorage.getItem(draftKey(conceptId, file))
        setText(draft ?? solution ?? '')
        setLoaded(true)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [conceptId, file])

  const onType = (value: string) => {
    setText(value)
    localStorage.setItem(draftKey(conceptId, file), value)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.saveSolution(conceptId, file, text)
      setSaved(text)
      localStorage.removeItem(draftKey(conceptId, file))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorState message={error} />
  if (!loaded || statement === null) return <Loading />

  const dirty = text !== (saved ?? '')
  const solved = saved !== null && saved.trim() !== ''

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="min-w-0">
        <MarkdownView markdown={statement} />
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-4 rounded-t-lg border border-b-0 border-hairline bg-linen-raw px-4 py-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Solution</h2>
            {dirty && (
              <span
                aria-label="Unsaved changes"
                title="Unsaved changes"
                className="inline-block h-1.5 w-1.5 rounded-full bg-burgundy"
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {solved && (
              <span className="inline-flex items-center rounded-full border border-moss/30 bg-moss/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] leading-none text-moss">
                Solved
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || text.trim() === '' || !dirty}
              className="inline-flex items-center gap-1.5 rounded-md bg-burgundy px-3 py-1.5 text-[13px] font-medium text-linen-bright transition-colors hover:bg-burgundy-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FloppyDisk size={13} weight="bold" aria-hidden />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              if (!saving && text.trim() !== '' && dirty) void save()
            }
          }}
          spellCheck={false}
          aria-label="Solution notepad"
          placeholder="Work it out here. Drafts are kept as you type."
          className="min-h-[420px] flex-1 resize-y rounded-b-lg border border-hairline bg-linen-bright p-4 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-burgundy/50"
        />
        <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted">
          <span>{text.length} characters</span>
          <span>
            <kbd>Ctrl S</kbd> save
          </span>
        </div>
      </div>
    </div>
  )
}
