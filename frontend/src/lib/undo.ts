// undo.ts — a tiny command-stack for the graph canvas. Each user action pushes a
// Command with undo()/redo() closures; Ctrl+Z pops the undo stack and Ctrl+Shift+Z
// / Ctrl+Y pops the redo stack. Doing a new action clears the redo stack (the
// standard editor model). History is in-memory / per-session: a reload starts
// clean (recovering a deleted concept still works across reloads because its
// content waits in .telar/trash until restoreConcept, but the *stack* resets).

export interface Command {
  /** Short human label for the action, surfaced in the undo/redo toast. */
  label: string
  /** Reverse the action (also re-persists the reversal to the backend). */
  undo: () => void | Promise<void>
  /** Re-apply the action after an undo. */
  redo: () => void | Promise<void>
}

export class UndoManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  /** Guards against overlapping undo/redo when a user hammers Ctrl+Z, since each
   *  step awaits async API calls. A second trigger is ignored until the first
   *  settles, so the stacks can't interleave. */
  private running = false

  push(cmd: Command): void {
    this.undoStack.push(cmd)
    this.redoStack = []
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }
  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  async undo(): Promise<Command | null> {
    if (this.running) return null
    const cmd = this.undoStack.pop()
    if (!cmd) return null
    this.running = true
    try {
      await cmd.undo()
    } finally {
      this.running = false
    }
    this.redoStack.push(cmd)
    return cmd
  }

  async redo(): Promise<Command | null> {
    if (this.running) return null
    const cmd = this.redoStack.pop()
    if (!cmd) return null
    this.running = true
    try {
      await cmd.redo()
    } finally {
      this.running = false
    }
    this.undoStack.push(cmd)
    return cmd
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
