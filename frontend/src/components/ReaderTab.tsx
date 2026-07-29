import { useEffect, useRef, useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { api } from '../lib/api'
import type { ContentFolder } from '../lib/types'
import MarkdownView from './MarkdownView'
import { EmptyState, ErrorState, Loading } from './ui'

// PDF.js runs its parser in a worker; point it at the URL Vite emits for the
// worker module. We render pages to <canvas> ourselves so a document shows
// inside the app regardless of the browser's own PDF handling.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export function prettyName(file: string): string {
  const base = file.replace(/\.(md|pdf)$/i, '').replace(/-/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

const isPdf = (file: string): boolean => file.toLowerCase().endsWith('.pdf')

interface ReaderTabProps {
  conceptId: string
  folder: Extract<ContentFolder, 'lessons' | 'examples'>
  files: string[]
  emptyTitle: string
  emptyHint: string
}

/** Shared reading surface for lessons and examples: file list + markdown, or an
 *  in-app PDF reader for study documents the user dropped into the folder. */
export default function ReaderTab({ conceptId, folder, files, emptyTitle, emptyHint }: ReaderTabProps) {
  const [selected, setSelected] = useState<string | null>(files[0] ?? null)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedIsPdf = selected !== null && isPdf(selected)

  useEffect(() => {
    // PDFs render from their bytes via PDF.js; only markdown is fetched as text.
    if (!selected || isPdf(selected)) return
    let alive = true
    setContent(null)
    setError(null)
    api
      .getFile(conceptId, folder, selected)
      .then((c) => alive && setContent(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [conceptId, folder, selected])

  if (files.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:flex-row md:gap-10">
      {files.length > 1 && (
        <aside className="shrink-0 md:w-52">
          <ul className="sticky top-0 flex flex-col gap-0.5">
            {files.map((file) => (
              <li key={file}>
                <button
                  type="button"
                  onClick={() => setSelected(file)}
                  className={`flex w-full items-center justify-between gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                    file === selected
                      ? 'border-burgundy bg-linen-bright font-medium text-ink'
                      : 'border-transparent text-muted hover:bg-linen-bright/60 hover:text-ink'
                  }`}
                >
                  <span className="truncate">{prettyName(file)}</span>
                  {isPdf(file) && (
                    <span className="shrink-0 rounded bg-linen-raw px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-muted">
                      pdf
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="mx-auto w-full min-w-0 max-w-4xl flex-1">
        {selected && (
          <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-hairline pb-3">
            <p className="font-mono text-[11px] text-muted">
              {folder}/{selected}
            </p>
            {files.length > 1 && (
              <p className="font-mono text-[11px] text-muted">
                {files.indexOf(selected) + 1} of {files.length}
              </p>
            )}
          </div>
        )}
        {selectedIsPdf ? (
          <PdfView url={api.fileUrl(conceptId, folder, selected)} name={selected} />
        ) : error ? (
          <ErrorState message={error} />
        ) : content === null ? (
          <Loading label="Unrolling…" />
        ) : (
          <MarkdownView markdown={content} />
        )}
      </div>
    </div>
  )
}

/** An in-app PDF reader: PDF.js renders every page to a canvas, stacked in a
 *  scrollable frame that sits on the linen. No dependency on the browser's own
 *  PDF viewer, so it shows even when the browser is set to download PDFs. */
function PdfView({ url, name }: { url: string; name: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setMessage('')
    setPageCount(0)
    const task = pdfjs.getDocument({ url })

    ;(async () => {
      try {
        const pdf = await task.promise
        if (cancelled) return
        setPageCount(pdf.numPages)
        const host = pagesRef.current
        if (!host) return
        host.replaceChildren()
        const dpr = window.devicePixelRatio || 1
        // Fit page width to the frame (minus padding), but never upscale past 2×.
        const avail = (scrollRef.current?.clientWidth ?? 800) - 32

        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return
          const page = await pdf.getPage(n)
          const unit = page.getViewport({ scale: 1 })
          const scale = Math.min(avail / unit.width, 2)
          const viewport = page.getViewport({ scale: scale * dpr })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = `${viewport.width / dpr}px`
          canvas.style.height = `${viewport.height / dpr}px`
          canvas.className = 'mx-auto mb-4 max-w-full rounded border border-hairline bg-white shadow-sm'
          host.appendChild(canvas)
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
        }
        if (!cancelled) setStatus('ready')
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : String(e))
          setStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [url])

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-linen-bright">
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-3 py-2">
        <span className="font-mono text-[11px] text-muted">
          {status === 'ready' ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : ' '}
        </span>
        <a
          href={url}
          download={name}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-burgundy transition-colors hover:text-burgundy-deep"
        >
          Download
          <DownloadSimple size={13} weight="bold" aria-hidden />
        </a>
      </div>
      <div ref={scrollRef} className="relative h-[78vh] overflow-y-auto bg-linen-raw p-4">
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loading label="Opening document…" />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <ErrorState message={message || 'This document could not be opened.'} />
          </div>
        )}
        <div ref={pagesRef} />
      </div>
    </div>
  )
}
