import { expect, mock, test } from 'claude-code/testing'
import type { MockClock, TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { normalizeRemote } from '../hooks/dev-notes/data'
import { displayText, escapeText, initialContent } from '../hooks/dev-notes/markdown'
import { DATA_SOURCE_ID, DATABASE_ID, FakeNotion } from './fake-notion'

const PLUGIN = 'slax57-workflow'
const OPTIONS = { options: { notionDatabaseId: DATABASE_ID } }
const NEUTRAL = 'Ressource indisponible.'
const SURFACES = ['terminal', 'desktop'] as const

const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: 'dev-notes',
  props: {
    title: 'Notes',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

type Git = { remote?: string; branch?: string; isRepo?: boolean }

/** Stands for the engine: the Notion connector, git, toasts, the store and the clock. */
function engine(on: On, notion: FakeNotion, git: Git = {}, servers: readonly string[] = ['claude.ai Notion']) {
  const toasts: string[] = []
  const answer = (server: string, tool: string, args: Record<string, unknown>) =>
    servers.includes(server) ? notion.handle(tool, args) : { content: [{ type: 'text', text: 'not connected' }], isError: true }

  on('mcp.call', (_, e) => ({ value: answer(e.server, e.tool, e.args) }))
  on('process.run', (_, e) => {
    const command = e.argv.slice(3).join(' ')
    const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
    const fail = { exitCode: 1, stdout: '', stderr: 'no' }
    const isRepo = git.isRepo ?? true
    const result =
      command === 'rev-parse --show-toplevel'
        ? isRepo ? ok('/work/claude-config\n') : fail
        : command === 'remote get-url origin'
          ? git.remote === undefined ? fail : ok(`${git.remote}\n`)
          : command === 'branch --show-current'
            ? ok(`${git.branch ?? 'main'}\n`)
            : fail

    return { value: { ...result, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'notes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const model = { answer: (_tool: string, _args: Record<string, unknown>): unknown => ({}), isReached: false }
  on('tool.call', (_, e) => {
    const { tool, tool_use_id: _id, ...args } = e as Record<string, unknown> & { tool: string }
    model.isReached = true
    const answer = model.answer(tool, args)
    return { result: Array.isArray(answer) ? answer : [{ type: 'text', text: JSON.stringify(answer) }] }
  })
  mock.store(on)
  const clock = mock.clock(on)

  return { toasts, clock, model }
}

const NOTES = [
  '<toggle heading="h2">',
  'Tests',
  '',
  '- [ ] premier cas',
  '- [x] deuxième cas',
  '</toggle>',
  '',
  '<toggle heading="h2">',
  'Revue',
  '</toggle>',
  '',
  '<toggle heading="h2">',
  'Arbitrages',
  '',
  '- choix A plutôt que B',
  '</toggle>',
  '',
  '<toggle heading="h2">',
  'Questions PO',
  '</toggle>',
  '',
  '<toggle heading="h2">',
  'TODO',
  '</toggle>',
].join('\n')

type Engine = Parameters<TestBody>[0]

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/work/claude-config', surface: 'desktop', isInteractive: true })
  await clock.advance(1)
  await clock.settle()
}

// Role 1: resolving the page at session start.

test('remotes are normalized to owner/repo', async () => {
  expect(normalizeRemote('git@github.com:slax57/claude-config.git')).toBe('slax57/claude-config')
  expect(normalizeRemote('ssh://git@github.com/slax57/claude-config.git')).toBe('slax57/claude-config')
  expect(normalizeRemote('https://github.com/slax57/claude-config')).toBe('slax57/claude-config')
  expect(normalizeRemote('https://token@github.com/slax57/claude-config.git/')).toBe('slax57/claude-config')
  expect(normalizeRemote('http://local_proxy@127.0.0.1:1234/git/slax57/claude-config')).toBe('slax57/claude-config')
})

test("item text survives Notion's escaping", async () => {
  // What Notion returned for an escaped write: it keeps every escape but `\>`.
  const stored = 'a \\*b\\* \\<c> \\[d\\] e\\_f \\$g \\`h\\` \\~i\\~'
  expect(displayText(stored)).toBe('a *b* <c> [d] e_f $g `h` ~i~')
  expect(displayText(escapeText('a *b* <c> [d] e_f $g `h` ~i~'))).toBe('a *b* <c> [d] e_f $g `h` ~i~')
})

test('an existing page is reused', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  notion.addPage('slax57/claude-config', 'main', NOTES)
  const { clock, toasts } = engine(on, notion, { remote: 'git@github.com:slax57/claude-config.git' })
  await start($, clock)

  expect(notion.calls.some(call => call.tool === 'notion-create-pages')).toBe(false)
  expect(notion.pages).toHaveLength(1)
  expect(toasts).toEqual([])
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /premier cas/ }))?.text).toBe('premier cas')
    await ui.unmount()
  }
})

test('the oldest of several matching pages is taken', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  notion.addPage('slax57/claude-config', 'main', NOTES.replace('premier cas', 'récente'), '2026-03-01 00:00:00Z')
  notion.addPage('slax57/claude-config', 'main', NOTES.replace('premier cas', 'ancienne'), '2026-01-01 00:00:00Z')
  const { clock } = engine(on, notion, { remote: 'https://github.com/slax57/claude-config.git' })
  await start($, clock)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /ancienne/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /récente/ })).toBeUndefined()
  await ui.unmount()
})

test('a missing page is created with its five headings', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  const { clock, toasts } = engine(on, notion, { remote: 'git@github.com:slax57/claude-config.git', branch: 'feat/x' })
  await start($, clock)

  const create = notion.calls.find(call => call.tool === 'notion-create-pages')
  expect(create?.args.parent).toEqual({ type: 'data_source_id', data_source_id: DATA_SOURCE_ID })
  expect(create?.args.pages).toEqual([
    {
      properties: { Name: 'slax57/claude-config · feat/x', Repo: 'slax57/claude-config', Branch: 'feat/x' },
      content: initialContent(),
    },
  ])
  for (const name of ['Tests', 'Revue', 'Arbitrages', 'Questions PO', 'TODO']) {
    expect(initialContent()).toContain(`<toggle heading="h2">\n${name}\n</toggle>`)
  }
  expect(toasts).toEqual(['Notes créées.'])
})

test('the folder name stands in when there is no origin remote', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  const { clock } = engine(on, notion, {})
  await start($, clock)

  const create = notion.calls.find(call => call.tool === 'notion-create-pages')
  expect((create?.args.pages as { properties: Record<string, string> }[])[0]?.properties.Repo).toBe('claude-config')
})

test('a detached HEAD toasts and touches nothing', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  const { clock, toasts } = engine(on, notion, { remote: 'git@github.com:a/b.git', branch: '' })
  await start($, clock)

  expect(notion.calls).toEqual([])
  expect(toasts).toEqual(['Notes : HEAD détachée, pas de notes pour cette session.'])
})

test('a missing connector toasts after its retries and throws nothing', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  const { clock, toasts } = engine(on, notion, { remote: 'git@github.com:a/b.git' }, [])
  await start($, clock)
  for (let attempt = 1; attempt < 5; attempt += 1) {
    await clock.advance(3000 * attempt)
    await clock.settle()
  }

  expect(toasts).toEqual([
    'Notes : connecteur Notion absent ou non connecté (claude.ai Notion : not connected ; Notion : not connected ; notion : not connected).',
  ])
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Connecteur Notion indisponible/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /claude\.ai Notion :/ }))?.text).toBe('- claude.ai Notion : not connected')
  await ui.unmount()
})

test('a connector that answers late is found by a retry', OPTIONS, async ($, on) => {
  const notion = new FakeNotion()
  notion.addPage('a/b', 'main', NOTES)
  const servers: string[] = []
  const { clock, toasts } = engine(on, notion, { remote: 'git@github.com:a/b.git' }, servers)
  await start($, clock)
  servers.push('claude.ai Notion')
  await clock.advance(3000)
  await clock.settle()

  expect(toasts).toEqual([])
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /premier cas/ })).toBeDefined()
  await ui.unmount()
})

// Role 2: /notes and the editable pane.

async function ready($: Engine, on: On) {
  const notion = new FakeNotion()
  const page = notion.addPage('a/b', 'main', NOTES)
  const { clock, toasts, model } = engine(on, notion, { remote: 'git@github.com:a/b.git' })
  await start($, clock)
  model.isReached = false

  return { notion, page, clock, toasts, model }
}

test('/notes answers {} and gives the model no text', OPTIONS, async ($, on) => {
  await ready($, on)

  expect(
    await $.command.run({
      command: 'notes',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    }),
  ).toEqual({})
})

test('an item is added, as a to-do or a bullet', OPTIONS, async ($, on) => {
  const { page } = await ready($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.input({ key: 'add:Revue', text: `cas ${surface}` })
    await ui.input({ key: 'add:Arbitrages', text: `arbitrage ${surface}` })
    expect((await ui.find({ key: 'add:Revue' }))?.props.value).toBe('')
    await ui.unmount()
  }

  expect(page.content).toContain('Revue\n\n- [ ] cas terminal\n- [ ] cas desktop\n</toggle>')
  expect(page.content).toContain('- choix A plutôt que B\n- arbitrage terminal\n- arbitrage desktop\n</toggle>')
})

test('an item is checked and unchecked', OPTIONS, async ($, on) => {
  const { page } = await ready($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'toggle:Tests:0' })
  expect(page.content).toContain('- [x] premier cas')
  await ui.press({ key: 'toggle:Tests:1' })
  expect(page.content).toContain('- [ ] deuxième cas')
  await ui.unmount()
})

test('an item is edited, and an edit can be cancelled', OPTIONS, async ($, on) => {
  const { page, notion } = await ready($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'edit-start:Tests:0' })
  expect((await ui.find({ key: 'edit:Tests:0' }))?.props.value).toBe('premier cas')
  await ui.input({ key: 'edit:Tests:0', text: 'cas *modifié*' })
  expect(page.content).toContain('- [ ] cas \\*modifié\\*\n- [x] deuxième cas')
  expect((await ui.find({ type: 'Text', text: /cas \*modifié\*/ }))?.text).toBe('cas *modifié*')

  const writes = notion.calls.filter(call => call.tool === 'notion-update-page').length
  await ui.press({ key: 'edit-start:Tests:1' })
  await ui.press({ key: 'cancel:Tests:1' })
  expect(await ui.find({ key: 'edit:Tests:1' })).toBeUndefined()
  expect(notion.calls.filter(call => call.tool === 'notion-update-page')).toHaveLength(writes)
  await ui.unmount()
})

test('an item is deleted only once confirmed', OPTIONS, async ($, on) => {
  const { page } = await ready($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'delete:Tests:0' })
  expect(page.content).toContain('premier cas')
  await ui.press({ key: 'delete-no:Tests:0' })
  await ui.press({ key: 'delete:Tests:0' })
  await ui.press({ key: 'delete-yes:Tests:0' })
  expect(page.content).not.toContain('premier cas')
  expect(page.content).toContain('Tests\n\n- [x] deuxième cas\n</toggle>')
  await ui.unmount()
})

test('a page changed elsewhere is not written, and the text stays', OPTIONS, async ($, on) => {
  const { page, notion, toasts } = await ready($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  page.content = page.content.replace('premier cas', 'changé dans Notion')
  page.edits += 1
  await ui.input({ key: 'add:TODO', text: 'à garder' })

  expect(notion.calls.some(call => call.tool === 'notion-update-page')).toBe(false)
  expect(toasts).toContain('Page modifiée ailleurs, rafraîchis.')
  expect((await ui.find({ key: 'add:TODO' }))?.props.value).toBe('à garder')
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: /changé dans Notion/ })).toBeDefined()
  await ui.unmount()
})

test('a failed write toasts and keeps the text in its field', OPTIONS, async ($, on) => {
  const { notion, toasts } = await ready($, on)
  notion.isWriteFailing = true
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'add:Tests', text: 'pas perdu' })
  expect(toasts.some(toast => toast.startsWith("Échec d'écriture"))).toBe(true)
  expect((await ui.find({ key: 'add:Tests' }))?.props.value).toBe('pas perdu')

  await ui.press({ key: 'edit-start:Tests:0' })
  await ui.input({ key: 'edit:Tests:0', text: 'édition gardée' })
  expect((await ui.find({ key: 'edit:Tests:0' }))?.props.value).toBe('édition gardée')
  await ui.unmount()
})

// Role 3: the filter on the model's Notion calls.

test('a masked page is refused to the model, by ID or URL', OPTIONS, async ($, on) => {
  const { page, model } = await ready($, on)
  for (const id of [page.id, `https://app.notion.com/p/Notes-${page.id}`, DATABASE_ID, `collection://${DATA_SOURCE_ID}`]) {
    const ran = await $.tool.call({ tool: 'mcp__claude_ai_Notion__notion-fetch', id })
    expect(JSON.stringify(ran)).toContain(NEUTRAL)
    expect(JSON.stringify(ran)).not.toContain(page.id)
  }
  expect(model.isReached).toBe(false)
})

test('a search keeps the plain pages and drops the masked ones', OPTIONS, async ($, on) => {
  const { page, model } = await ready($, on)
  const plain = { id: '99999999-9999-4999-8999-999999999999', title: 'Roadmap', url: 'https://app.notion.com/p/99999999999949998999999999999999', type: 'page' }
  model.answer = () => ({
    results: [
      plain,
      { id: page.id, title: 'a/b · main', url: `https://app.notion.com/p/${page.id}`, type: 'page' },
      { id: '88888888-8888-4888-8888-888888888888', title: 'Other', url: 'https://app.notion.com/p/88888888888848888888888888888888', type: 'page', parent_data_source_url: `collection://${DATA_SOURCE_ID}` },
    ],
    type: 'workspace_search',
  })
  const ran = await $.tool.call({ tool: 'mcp__claude_ai_Notion__notion-search', query: 'notes' })

  expect(ran.result).toEqual([{ type: 'text', text: JSON.stringify({ results: [plain], type: 'workspace_search' }) }])
})

test('a page that links the database loses that line only', OPTIONS, async ($, on) => {
  const { model } = await ready($, on)
  const parent = {
    metadata: { type: 'page' },
    url: 'https://app.notion.com/p/77777777777747778777777777777777',
    text: `<page url="https://app.notion.com/p/77777777777747778777777777777777">\n<content>\nIntro\n<database url="{{https://app.notion.com/p/${DATABASE_ID}}}" inline="false">Dev notes</database>\nOutro\n</content>\n</page>`,
  }
  model.answer = () => parent
  const ran = await $.tool.call({ tool: 'mcp__claude_ai_Notion__notion-fetch', id: '77777777777747778777777777777777' })
  const text = (ran.result as { text: string }[])[0]?.text ?? ''

  expect(text).toContain('Intro')
  expect(text).toContain('Outro')
  expect(text).not.toContain(DATABASE_ID)
  expect(text).not.toContain('Dev notes')
})

test('an unknown structure naming a masked ID is replaced whole', OPTIONS, async ($, on) => {
  const { page, model } = await ready($, on)
  model.answer = () => [{ type: 'text', text: `Some prose about https://app.notion.com/p/${page.id} and more` }]
  const ran = await $.tool.call({ tool: 'mcp__claude_ai_Notion__notion-list-recent-pages' })

  expect(ran.result).toEqual([{ type: 'text', text: NEUTRAL }])
})

test("the model's writes on the database are refused", OPTIONS, async ($, on) => {
  const { page, model } = await ready($, on)
  const calls = [
    { tool: 'mcp__claude_ai_Notion__notion-create-pages', parent: { type: 'data_source_id', data_source_id: DATA_SOURCE_ID }, pages: [] },
    { tool: 'mcp__claude_ai_Notion__notion-update-page', page_id: page.id, command: 'replace_content', new_str: '' },
    { tool: 'mcp__claude_ai_Notion__notion-move-pages', page_or_database_ids: [page.id], new_parent: { type: 'workspace' } },
    { tool: 'mcp__claude_ai_Notion__notion-create-comment', page_id: page.id, rich_text: [] },
  ] as const
  for (const call of calls) {
    expect(JSON.stringify(await $.tool.call(call))).toContain(NEUTRAL)
  }
  expect(model.isReached).toBe(false)
})

test('the Notion agent tools are always refused', OPTIONS, async ($, on) => {
  const { model } = await ready($, on)
  const ran = await $.tool.call({ tool: 'mcp__claude_ai_Notion__notion-spawn-session', prompt: 'résume tout' })

  expect(JSON.stringify(ran)).toContain(NEUTRAL)
  expect(model.isReached).toBe(false)
})

test('a legitimate call goes through unchanged', OPTIONS, async ($, on) => {
  const { model } = await ready($, on)
  const answer = { results: [{ id: '99999999-9999-4999-8999-999999999999', title: 'Roadmap', type: 'page' }], type: 'workspace_search' }
  model.answer = tool => (tool === 'Bash' ? {} : answer)
  const ran = await $.tool.call({ tool: 'mcp__claude_ai_Notion__notion-search', query: 'roadmap' })
  const other = await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(ran.result).toEqual([{ type: 'text', text: JSON.stringify(answer) }])
  expect(other.result).toEqual([{ type: 'text', text: '{}' }])
})

test("the mod's own calls are not filtered", OPTIONS, async ($, on) => {
  const { page } = await ready($, on)
  page.content = page.content.replace('premier cas', 'relu par le mod')
  page.edits += 1
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })

  expect(await ui.find({ type: 'Text', text: /relu par le mod/ })).toBeDefined()
  await ui.unmount()
})
