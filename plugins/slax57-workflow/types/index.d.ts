export type DevNotesItemKind = 'todo' | 'bullet'

export type DevNotesItem = {
  kind: DevNotesItemKind
  checked: boolean
  /** The item's text as Notion stores it (Notion-flavored Markdown). */
  text: string
}

export type DevNotesEntry =
  | { type: 'item'; item: DevNotesItem; children: string[] }
  | { type: 'raw'; lines: string[] }

export type DevNotesSection = {
  name: string
  /** The section's opening `<toggle ...>` line, kept as Notion wrote it. */
  open: string
  /** The whole section exactly as fetched: the `old_str` of a write. */
  block: string
  entries: DevNotesEntry[]
}

export type DevNotesPage = {
  id: string
  url: string
  lastEditedAt: string
  content: string
  sections: DevNotesSection[]
}

export type DevNotesView =
  | { status: 'idle' | 'loading' | 'unconfigured' | 'no-repo' | 'detached' }
  | { status: 'unavailable'; attempts: string[] }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: DevNotesPage }

export type DevNotesUi = {
  drafts: Record<string, string>
  editing: string | null
  confirming: string | null
  isBusy: boolean
}

export type DevNotesMask = {
  ids: string[]
  dataSourceUrl: string | null
  server: string | null
  refreshedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'slax57-workflow': {
      notesView: Shaped<DevNotesView>
      notesUi: Shaped<DevNotesUi>
      notesMask: Shaped<DevNotesMask>
    }
  }
}
