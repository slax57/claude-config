// dev-notes: one Notion page of control notes per repo and branch, shown and
// edited in a pane, and kept out of the model's reach. Nothing here answers
// the model: commands return `{}`, feedback goes through the pane and toasts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, ToolCallResult } from 'claude-code'

import type { DevNotesEntry, DevNotesMask, DevNotesUi, DevNotesView } from '../../types'

import {
  createPage,
  fetchPage,
  idsIn,
  listPages,
  messageOf,
  pickPage,
  resolveDatabase,
  resolveRepo,
  textOf,
} from './data'
import type { GitPort, McpBlock, McpResult, NotionPort } from './data'
import {
  argumentsOf,
  callKey,
  isAlwaysDenied,
  isNotionTool,
  mentionsMasked,
  NEUTRAL,
  neutralBlocks,
  scrubBlocks,
  splitToolName,
  stableJson,
} from './filter'
import { addEntry, deleteEntry, editEntry, SECTIONS, toggleEntry } from './markdown'
import { writeSection } from './data'
import { renderPane } from './pane'

const PANE = 'dev-notes'
const SERVER_CANDIDATES = ['claude.ai Notion', 'Notion', 'notion']
const ATTEMPTS = 5
const RETRY_MS = 3000
const MASK_TTL_MS = 60_000
const STORE_KEY = 'devNotesMask'

const view = atom({ plugin: 'slax57-workflow', key: 'notesView' } as const, { status: 'idle' } as DevNotesView, {
  shape: 'notes-view-2',
})
const ui = atom(
  { plugin: 'slax57-workflow', key: 'notesUi' } as const,
  { drafts: {}, editing: null, confirming: null, isBusy: false } as DevNotesUi,
  { shape: 'notes-ui-1' },
)
const mask = atom(
  { plugin: 'slax57-workflow', key: 'notesMask' } as const,
  { ids: [], dataSourceUrl: null, server: null, refreshedAt: 0 } as DevNotesMask,
  { shape: 'notes-mask-1' },
)

/** The mod's own Notion calls in flight, by tool name and arguments: the filter lets them through. */
const ownCalls = new Map<string, number>()
let databaseId = ''
let cwd = '.'

function configuredDatabaseId(options: PluginOptions): string {
  const value = options.notionDatabaseId

  return typeof value === 'string' ? (idsIn(value)[0] ?? '') : ''
}

async function notionCall($: EngineInterface, server: string, tool: string, args: Record<string, unknown>) {
  const key = callKey(tool, args)
  ownCalls.set(key, (ownCalls.get(key) ?? 0) + 1)
  try {
    return (await $.mcp.call(server, tool, args)) as McpResult
  } finally {
    const left = (ownCalls.get(key) ?? 1) - 1
    if (left === 0) {
      ownCalls.delete(key)
    } else {
      ownCalls.set(key, left)
    }
  }
}

function notionPort($: EngineInterface, server: string): NotionPort {
  return { call: (tool, args) => notionCall($, server, tool, args) }
}

function gitPort($: EngineInterface): GitPort {
  return {
    run: async argv => {
      const ran = await $.process.run(['git', '-C', cwd, ...argv])
      return { exitCode: ran.exitCode, stdout: ran.stdout }
    },
  }
}

/** The servers whose tools include `notion-fetch`, by the spelling their tool names carry. */
async function connectedNotionServers($: EngineInterface): Promise<string[]> {
  try {
    return (await $.tool.list()).flatMap(tool => {
      const parts = tool.mcp ? splitToolName(tool.name) : undefined
      return parts?.name === 'notion-fetch' ? [parts.server] : []
    })
  } catch {
    return []
  }
}

/** The connected Notion server, probed by reading the database; else what each name answered. */
async function detectServer($: EngineInterface): Promise<{ server: string } | { attempts: string[] }> {
  const known = (await read($, mask)).server
  const listed = await connectedNotionServers($)
  const attempts: string[] = []
  for (const server of new Set([...(known === null ? [] : [known]), ...listed, ...SERVER_CANDIDATES])) {
    try {
      const probe = await notionCall($, server, 'notion-fetch', { id: databaseId })
      if (!probe.isError) {
        return { server }
      }
      attempts.push(`${server} : ${textOf(probe).slice(0, 160)}`)
    } catch (error) {
      attempts.push(`${server} : ${messageOf(error).slice(0, 160)}`)
    }
  }

  return { attempts }
}

async function saveMask($: EngineInterface, change: (current: DevNotesMask) => DevNotesMask) {
  const next = await update($, mask, change)
  await $.store.set(STORE_KEY, { dataSourceUrl: next.dataSourceUrl, server: next.server, ids: next.ids })
}

async function loadStoredMask($: EngineInterface) {
  const stored = (await $.store.get(STORE_KEY)) as Partial<DevNotesMask> | undefined
  await update($, mask, current => ({
    ids: [...new Set([...current.ids, ...(stored?.ids ?? []), ...(databaseId === '' ? [] : [databaseId])])],
    dataSourceUrl: current.dataSourceUrl ?? stored?.dataSourceUrl ?? null,
    server: current.server ?? stored?.server ?? null,
    refreshedAt: current.refreshedAt,
  }))
}

async function setView($: EngineInterface, next: DevNotesView) {
  await update($, view, () => next)
}

async function startup($: EngineInterface, attempt: number) {
  if (databaseId === '') {
    await setView($, { status: 'unconfigured' })
    $.ui.toast('Notes : base Notion non configurée (notionDatabaseId).')
    return
  }
  const repo = await resolveRepo(gitPort($))
  if (repo.kind === 'no-repo') {
    await setView($, { status: 'no-repo' })
    return
  }
  if (repo.kind === 'detached') {
    await setView($, { status: 'detached' })
    $.ui.toast('Notes : HEAD détachée, pas de notes pour cette session.')
    return
  }
  await setView($, { status: 'loading' })

  const detected = await detectServer($)
  if (!('server' in detected)) {
    if (attempt < ATTEMPTS) {
      $.clock.after(RETRY_MS * attempt, () => void startup($, attempt + 1))
      return
    }
    await setView($, { status: 'unavailable', attempts: detected.attempts })
    $.ui.toast(`Notes : connecteur Notion absent ou non connecté (${detected.attempts.join(' ; ')}).`)
    return
  }

  const { server } = detected
  try {
    const port = notionPort($, server)
    const database = await resolveDatabase(port, databaseId)
    const rows = await listPages(port, database.dataSourceUrl)
    let target = pickPage(rows, repo.repo, repo.branch)
    let isCreated = false
    if (target === undefined) {
      const created = await createPage(port, database.dataSourceUrl, repo.repo, repo.branch)
      target = { ...created, repo: repo.repo, branch: repo.branch, createdTime: '' }
      isCreated = true
    }
    const pageId = target.id
    await saveMask($, current => ({
      ids: [...new Set([...current.ids, ...database.ids, ...rows.map(row => row.id), pageId])],
      dataSourceUrl: database.dataSourceUrl,
      server,
      refreshedAt: Date.now(),
    }))
    const page = await fetchPage(port, pageId)
    await setView($, { status: 'ready', page })
    if (isCreated) {
      $.ui.toast('Notes créées.')
    }
  } catch (error) {
    await setView($, { status: 'error', message: messageOf(error) })
    $.ui.toast(`Notes : ${messageOf(error)}`)
  }
}

async function refreshMask($: EngineInterface) {
  const current = await read($, mask)
  if (current.dataSourceUrl === null || current.server === null || Date.now() - current.refreshedAt < MASK_TTL_MS) {
    return
  }
  const dataSourceUrl = current.dataSourceUrl
  try {
    const rows = await listPages(notionPort($, current.server), dataSourceUrl)
    await saveMask($, latest => ({
      ...latest,
      ids: [...new Set([...latest.ids, ...rows.map(row => row.id)])],
      refreshedAt: Date.now(),
    }))
  } catch {
    // Keep the mask as it is; results are still checked against it.
  }
}

async function refreshPage($: EngineInterface) {
  const current = await read($, view)
  const { server } = await read($, mask)
  if (current.status !== 'ready' || server === null) {
    void startup($, 1)
    return
  }
  try {
    const page = await fetchPage(notionPort($, server), current.page.id)
    await setView($, { status: 'ready', page })
  } catch (error) {
    $.ui.toast(`Notes : lecture impossible (${messageOf(error)}).`)
  }
}

async function setUi($: EngineInterface, change: (current: DevNotesUi) => DevNotesUi) {
  await update($, ui, change)
}

/** One write: the version check, the write, the outcome; `onWritten` clears what the write used. */
async function write(
  $: EngineInterface,
  sectionName: string,
  change: (entries: DevNotesEntry[]) => DevNotesEntry[],
  onWritten: (current: DevNotesUi) => DevNotesUi,
) {
  const current = await read($, view)
  const { server } = await read($, mask)
  if (current.status !== 'ready' || server === null) {
    $.ui.toast('Notes pas encore chargées.')
    return
  }
  if ((await read($, ui)).isBusy) {
    $.ui.toast('Écriture déjà en cours.')
    return
  }
  await setUi($, state => ({ ...state, isBusy: true }))
  try {
    const outcome = await writeSection(notionPort($, server), current.page, sectionName, change)
    if (outcome.kind === 'conflict') {
      $.ui.toast('Page modifiée ailleurs, rafraîchis.')
    } else if (outcome.kind === 'error') {
      $.ui.toast(`Échec d'écriture : ${outcome.message}`)
    } else {
      if (outcome.page !== undefined) {
        await setView($, { status: 'ready', page: outcome.page })
      } else {
        void refreshPage($)
      }
      await setUi($, onWritten)
    }
  } finally {
    await setUi($, state => ({ ...state, isBusy: false }))
  }
}

function withoutDraft(drafts: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(drafts).filter(([draftKey]) => draftKey !== key))
}

/** What was typed stays in its field until the write succeeds. */
async function keepDraft($: EngineInterface, key: string, text: string) {
  await setUi($, current => ({ ...current, drafts: { ...current.drafts, [key]: text } }))
}

function kindOf(sectionName: string) {
  return SECTIONS.find(section => section.name === sectionName)?.kind ?? 'todo'
}

async function addItem($: EngineInterface, sectionName: string, key: string, text: string) {
  if (text.trim() === '') {
    return
  }
  await keepDraft($, key, text)
  await write(
    $,
    sectionName,
    entries => addEntry(entries, kindOf(sectionName), text.trim()),
    state => ({ ...state, drafts: withoutDraft(state.drafts, key) }),
  )
}

async function saveEdit($: EngineInterface, sectionName: string, index: number, key: string, text: string) {
  if (text.trim() === '') {
    $.ui.toast('Texte vide : utilise « supprimer ».')
    return
  }
  await keepDraft($, `edit:${key}`, text)
  await write(
    $,
    sectionName,
    entries => editEntry(entries, index, text.trim()),
    state => ({ ...state, editing: null, drafts: withoutDraft(state.drafts, `edit:${key}`) }),
  )
}

async function toggleItem($: EngineInterface, sectionName: string, index: number) {
  await write($, sectionName, entries => toggleEntry(entries, index), state => state)
}

async function deleteItem($: EngineInterface, sectionName: string, index: number) {
  await write($, sectionName, entries => deleteEntry(entries, index), state => ({ ...state, confirming: null }))
}

async function openNotes($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: 'Notes' })
  if (!opened.isPlaced) {
    const current = await read($, view)
    $.ui.toast(current.status === 'ready' ? current.page.url : 'Notes indisponibles ici.')
  }
  void refreshPage($)
}

/** The filter on the model's Notion calls: refuse what names a masked ID, scrub what returns one. */
async function filterCall(
  $: EngineInterface,
  tool: string,
  args: Record<string, unknown>,
  run: () => Promise<ToolCallResult>,
) {
  if (isAlwaysDenied(tool)) {
    return { kind: 'deny' as const }
  }
  await refreshMask($)
  const ids = new Set((await read($, mask)).ids)
  if (databaseId !== '') {
    ids.add(databaseId)
  }
  if (mentionsMasked(stableJson(args), ids)) {
    return { kind: 'deny' as const }
  }
  const ran = await run()
  if (ran.deny !== undefined) {
    return { kind: 'pass' as const, ran }
  }
  if (!Array.isArray(ran.result)) {
    const isClean = !mentionsMasked(`${JSON.stringify(ran.result) ?? ''}\n${ran.text ?? ''}`, ids)
    return isClean ? { kind: 'pass' as const, ran } : { kind: 'replace' as const, blocks: neutralBlocks() }
  }
  const blocks = ran.result as McpBlock[]
  const scrubbed = scrubBlocks(blocks, ids)
  if (scrubbed === blocks && !mentionsMasked(ran.text ?? '', ids)) {
    return { kind: 'pass' as const, ran }
  }

  return { kind: 'replace' as const, blocks: scrubbed ?? neutralBlocks() }
}

export const register: Register = (on, options) => {
  databaseId = configuredDatabaseId(options)

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({ name: 'notes', description: 'Notes privées' })
    const started = await next(e)
    await loadStoredMask($)
    $.clock.after(0, () => void startup($, 1))

    return started
  })

  on('command.run', { command: 'notes' }, async $ => {
    await openNotes($)

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Link } = $.ui.resolve(e)
    const shown = await read($, view)
    const state = await read($, ui)

    return renderPane({ Box, Text, Button, Input, Link }, shown, state, {
      refresh: () => void refreshPage($),
      toggle: (section, index) => void toggleItem($, section, index),
      startEdit: (key, text) =>
        void setUi($, current => ({
          ...current,
          editing: key,
          confirming: null,
          drafts: { ...current.drafts, [`edit:${key}`]: current.drafts[`edit:${key}`] ?? text },
        })),
      cancelEdit: key =>
        void setUi($, current => ({ ...current, editing: null, drafts: withoutDraft(current.drafts, `edit:${key}`) })),
      saveEdit: (section, index, key, text) => void saveEdit($, section, index, key, text),
      askDelete: key => void setUi($, current => ({ ...current, confirming: key, editing: null })),
      cancelDelete: () => void setUi($, current => ({ ...current, confirming: null })),
      confirmDelete: (section, index) => void deleteItem($, section, index),
      draft: (key, text) => void setUi($, current => ({ ...current, drafts: { ...current.drafts, [key]: text } })),
      add: (section, key, text) => void addItem($, section, key, text),
    })
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (!isNotionTool(tool)) {
      return next(e)
    }
    const args = argumentsOf(e as Record<string, unknown>)
    if (ownCalls.has(callKey(splitToolName(tool)?.name ?? '', args))) {
      return next(e)
    }
    const outcome = await filterCall($, tool, args, () => next(e))
    if (outcome.kind === 'deny') {
      return { deny: NEUTRAL }
    }
    if (outcome.kind === 'replace') {
      return { result: outcome.blocks }
    }

    return outcome.ran
  }).catch(() => ({ deny: NEUTRAL }))
}
