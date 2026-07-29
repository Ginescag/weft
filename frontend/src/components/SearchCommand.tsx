import { useEffect } from 'react'
import { Command } from 'cmdk'
import type { Graph } from '../lib/types'

interface SearchCommandProps {
  graph: Graph
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the chosen concept id; the graph centers on it. */
  onLocate: (id: string) => void
}

/**
 * Ctrl+K / "/" palette to find a concept by name and land the viewport on it.
 */
export default function SearchCommand({ graph, open, onOpenChange, onLocate }: SearchCommandProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
        return
      }
      if (event.key === '/' && !open) {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        event.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search concepts"
      overlayClassName="fixed inset-0 z-40 bg-ink/25"
      contentClassName="fixed left-1/2 top-24 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2"
    >
      <div className="overflow-hidden rounded-lg border border-hairline bg-linen-bright">
        <Command.Input
          placeholder="Search concepts by name"
          className="block w-full border-b border-hairline bg-transparent px-5 py-4 text-[15px] text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto py-2">
          <Command.Empty className="px-5 py-6 text-sm text-muted">
            No concept matches that thread.
          </Command.Empty>
          {graph.nodos.map((node) => (
            <Command.Item
              key={node.id}
              value={`${node.nombre} ${node.id}`}
              onSelect={() => {
                onOpenChange(false)
                onLocate(node.id)
              }}
              className="flex cursor-pointer items-start px-5 py-3 data-[selected=true]:bg-linen-raw"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{node.nombre}</span>
                <span className="block truncate text-[12.5px] text-muted">{node.resumen}</span>
              </span>
            </Command.Item>
          ))}
        </Command.List>
        <div className="flex items-center gap-5 border-t border-hairline px-5 py-2.5 text-[11px] text-muted">
          <span>
            <kbd>Enter</kbd> locate on the linen
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </Command.Dialog>
  )
}
