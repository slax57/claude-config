import type {
  DevNotesEntry,
  DevNotesItem,
  DevNotesItemKind,
  DevNotesPage,
  DevNotesSection,
} from '../../types'

export const SECTIONS: readonly { name: string; kind: DevNotesItemKind }[] = [
  { name: 'Tests', kind: 'todo' },
  { name: 'Revue', kind: 'todo' },
  { name: 'Arbitrages', kind: 'bullet' },
  { name: 'Questions PO', kind: 'todo' },
  { name: 'TODO', kind: 'todo' },
]

const TOGGLE_OPEN = /^<toggle heading="h[1-4]"[^>]*>$/
const TOGGLE_CLOSE = '</toggle>'
const TODO_LINE = /^- \[( |x)\] ?(.*)$/
const BULLET_LINE = /^- (.*)$/
const ESCAPABLE = /([\\*_`~[\]<>$])/g
const ESCAPED = /\\([\\*_`~[\]<>$])/g

export function initialContent(): string {
  return SECTIONS.map(({ name }) => `<toggle heading="h2">\n${name}\n</toggle>`).join('\n\n')
}

export function escapeText(text: string): string {
  return text.replace(ESCAPABLE, '\\$1')
}

export function displayText(text: string): string {
  return text.replace(ESCAPED, '$1')
}

/** Reads a `notion-fetch` result's JSON into a page; undefined when it is no page. */
export function parsePage(json: unknown): DevNotesPage | undefined {
  if (typeof json !== 'object' || json === null) {
    return undefined
  }
  const record = json as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : undefined
  const url = typeof record.url === 'string' ? record.url.replace(/\?.*$/, '') : undefined
  if (text === undefined || url === undefined) {
    return undefined
  }
  const content = /<content>\n?([\s\S]*?)\n?<\/content>/.exec(text)?.[1] ?? ''
  const id = /([0-9a-f]{32})$/i.exec(url.replace(/-/g, ''))?.[1]?.toLowerCase() ?? ''

  return {
    id,
    url,
    lastEditedAt: typeof record.page_last_edited_at === 'string' ? record.page_last_edited_at : '',
    content,
    sections: parseSections(content),
  }
}

/** The page's top-level toggle headings whose title is one of SECTIONS. */
export function parseSections(content: string): DevNotesSection[] {
  const lines = content.split('\n')
  const sections: DevNotesSection[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!TOGGLE_OPEN.test(line)) {
      index += 1
      continue
    }
    const end = closingLine(lines, index)
    if (end === -1) {
      break
    }
    const name = (lines[index + 1] ?? '').trim()
    if (index + 1 < end && SECTIONS.some(section => section.name === name)) {
      sections.push({
        name,
        open: line,
        block: lines.slice(index, end + 1).join('\n'),
        entries: parseEntries(lines.slice(index + 2, end)),
      })
    }
    index = end + 1
  }

  return sections
}

function closingLine(lines: string[], start: number): number {
  let depth = 0
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (TOGGLE_OPEN.test(line)) {
      depth += 1
    } else if (line === TOGGLE_CLOSE) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function parseEntries(body: string[]): DevNotesEntry[] {
  const entries: DevNotesEntry[] = []
  let raw: string[] | undefined
  let depth = 0

  for (const line of body) {
    if (raw !== undefined && depth > 0) {
      raw.push(line)
      depth += tagDepth(line)
      continue
    }
    if (line.trim() === '') {
      raw = undefined
      continue
    }
    const last = entries[entries.length - 1]
    if (/^\s/.test(line) && last?.type === 'item') {
      last.children.push(line)
      continue
    }
    const item = parseItem(line)
    if (item !== undefined) {
      raw = undefined
      entries.push({ type: 'item', item, children: [] })
      continue
    }
    if (raw === undefined) {
      raw = []
      entries.push({ type: 'raw', lines: raw })
    }
    raw.push(line)
    depth += tagDepth(line)
  }

  return entries
}

function parseItem(line: string): DevNotesItem | undefined {
  const todo = TODO_LINE.exec(line)
  if (todo !== null) {
    return { kind: 'todo', checked: todo[1] === 'x', text: todo[2] ?? '' }
  }
  const bullet = BULLET_LINE.exec(line)
  if (bullet !== null) {
    return { kind: 'bullet', checked: false, text: bullet[1] ?? '' }
  }

  return undefined
}

/** How many block tags a line leaves open (negative when it closes them). */
function tagDepth(line: string): number {
  const opened = /^<([a-z-]+)(\s[^>]*)?>/.exec(line)
  if (opened !== null && !line.endsWith('/>') && !line.includes(`</${opened[1]}>`)) {
    return 1
  }

  return /^<\/[a-z-]+>$/.test(line) ? -1 : 0
}

export function itemLine(item: DevNotesItem): string {
  return item.kind === 'todo' ? `- [${item.checked ? 'x' : ' '}] ${item.text}` : `- ${item.text}`
}

export function serializeSection(section: DevNotesSection, entries: DevNotesEntry[]): string {
  if (entries.length === 0) {
    return `${section.open}\n${section.name}\n${TOGGLE_CLOSE}`
  }
  const body: string[] = []
  entries.forEach((entry, index) => {
    const previous = entries[index - 1]
    if (previous !== undefined && (entry.type === 'raw' || previous.type === 'raw')) {
      body.push('')
    }
    if (entry.type === 'raw') {
      body.push(...entry.lines)
    } else {
      body.push(itemLine(entry.item), ...entry.children)
    }
  })

  return `${section.open}\n${section.name}\n\n${body.join('\n')}\n${TOGGLE_CLOSE}`
}

export function addEntry(entries: DevNotesEntry[], kind: DevNotesItemKind, text: string): DevNotesEntry[] {
  return [...entries, { type: 'item', item: { kind, checked: false, text: escapeText(text) }, children: [] }]
}

export function editEntry(entries: DevNotesEntry[], index: number, text: string): DevNotesEntry[] {
  return entries.map((entry, at) =>
    at === index && entry.type === 'item' ? { ...entry, item: { ...entry.item, text: escapeText(text) } } : entry,
  )
}

export function toggleEntry(entries: DevNotesEntry[], index: number): DevNotesEntry[] {
  return entries.map((entry, at) =>
    at === index && entry.type === 'item' && entry.item.kind === 'todo'
      ? { ...entry, item: { ...entry.item, checked: !entry.item.checked } }
      : entry,
  )
}

export function deleteEntry(entries: DevNotesEntry[], index: number): DevNotesEntry[] {
  return entries.filter((_, at) => at !== index)
}
