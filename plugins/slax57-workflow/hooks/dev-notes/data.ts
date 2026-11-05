// Data layer: Notion access through an injected port, repo/branch
// resolution, page lookup and creation, item writes with a version check.
// No UI and no `$` here, so the rendering can be replaced on its own.
import type { DevNotesEntry, DevNotesPage } from '../../types'

import { initialContent, parsePage, serializeSection } from './markdown'

export type McpBlock = { type: string; text?: string; [field: string]: unknown }
export type McpResult = { content: McpBlock[]; isError: boolean }

export type NotionPort = {
  call: (tool: string, args: Record<string, unknown>) => Promise<McpResult>
}

export type GitPort = {
  run: (argv: string[]) => Promise<{ exitCode: number; stdout: string }>
}

export type RepoRef =
  | { kind: 'branch'; repo: string; branch: string }
  | { kind: 'detached' }
  | { kind: 'no-repo' }

export type DatabaseRef = { dataSourceUrl: string; ids: string[] }

export type PageRow = { id: string; url: string; repo: string; branch: string; createdTime: string }

export type WriteOutcome =
  | { kind: 'written'; page: DevNotesPage | undefined }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string }

const HEX_ID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi

export function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase()
}

/** Every Notion ID written in `text` (URLs, dashed or bare UUIDs), normalized. */
export function idsIn(text: string): string[] {
  return (text.match(HEX_ID) ?? []).map(normalizeId)
}

export function normalizeRemote(remote: string): string | undefined {
  const trimmed = remote.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  const path = /^[^@/]+@[^:/]+:(.+)$/.exec(trimmed)?.[1] ?? /^[a-z+]+:\/\/[^/]+\/(.+)$/i.exec(trimmed)?.[1]
  const parts = (path ?? '').split('/').filter(part => part !== '')

  return parts.length >= 2 ? parts.slice(-2).join('/') : undefined
}

export async function resolveRepo(git: GitPort): Promise<RepoRef> {
  const top = await git.run(['rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) {
    return { kind: 'no-repo' }
  }
  const remote = await git.run(['remote', 'get-url', 'origin'])
  const fromRemote = remote.exitCode === 0 ? normalizeRemote(remote.stdout) : undefined
  const repo = fromRemote ?? top.stdout.trim().split('/').filter(Boolean).pop() ?? ''
  const branch = await git.run(['branch', '--show-current'])
  const name = branch.exitCode === 0 ? branch.stdout.trim() : ''

  return name === '' ? { kind: 'detached' } : { kind: 'branch', repo, branch: name }
}

export function pageTitle(repo: string, branch: string): string {
  return `${repo} · ${branch}`
}

export function textOf(result: McpResult): string {
  return result.content.map(block => block.text ?? '').join('\n')
}

function jsonOf(result: McpResult): unknown {
  try {
    return JSON.parse(textOf(result))
  } catch {
    return undefined
  }
}

function failure(tool: string, result: McpResult): Error {
  return new Error(`${tool}: ${textOf(result).slice(0, 200)}`)
}

/** The database's data source and the IDs that name it (database, sources, views). */
export async function resolveDatabase(port: NotionPort, databaseId: string): Promise<DatabaseRef> {
  const result = await port.call('notion-fetch', { id: databaseId })
  if (result.isError) {
    throw failure('notion-fetch', result)
  }
  const text = textOf(result)
  const sources = text.match(/collection:\/\/[0-9a-f-]{32,36}/gi) ?? []
  const views = text.match(/view:\/\/[0-9a-f-]{32,36}/gi) ?? []
  if (sources.length === 0) {
    throw new Error('notion-fetch: no data source in the database')
  }

  return {
    dataSourceUrl: sources[0] ?? '',
    ids: [...new Set([normalizeId(databaseId), ...[...sources, ...views].flatMap(idsIn)])],
  }
}

function rowOf(row: Record<string, unknown>): PageRow | undefined {
  const url = typeof row.url === 'string' ? row.url : ''
  const id = idsIn(url)[0]
  if (id === undefined) {
    return undefined
  }

  return {
    id,
    url,
    repo: typeof row.Repo === 'string' ? row.Repo : '',
    branch: typeof row.Branch === 'string' ? row.Branch : '',
    createdTime: typeof row.createdTime === 'string' ? row.createdTime : '',
  }
}

function rowsOf(json: unknown): { rows: PageRow[]; hasMore: boolean } {
  const record = (json ?? {}) as { results?: unknown; has_more?: unknown }
  const results = Array.isArray(record.results) ? record.results : []
  const rows = results.flatMap(row => {
    const parsed = typeof row === 'object' && row !== null ? rowOf(row as Record<string, unknown>) : undefined
    return parsed === undefined ? [] : [parsed]
  })

  return { rows, hasMore: record.has_more === true }
}

/** Every page of the data source; SQL first (it gives creation times), rows mode else. */
export async function listPages(port: NotionPort, dataSourceUrl: string): Promise<PageRow[]> {
  const pageSize = 100
  const rows: PageRow[] = []
  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const result = await port.call('notion-query-data-sources', {
      data: {
        mode: 'sql',
        data_source_urls: [dataSourceUrl],
        query: `SELECT url, createdTime, "Repo", "Branch" FROM "${dataSourceUrl}" ORDER BY datetime(createdTime) ASC LIMIT ? OFFSET ?`,
        params: [pageSize, offset],
      },
    })
    if (result.isError) {
      if (offset > 0) {
        throw failure('notion-query-data-sources', result)
      }
      return listPagesByRows(port, dataSourceUrl)
    }
    const page = rowsOf(jsonOf(result))
    rows.push(...page.rows)
    if (page.rows.length < pageSize && !page.hasMore) {
      break
    }
  }

  return rows
}

async function listPagesByRows(port: NotionPort, dataSourceUrl: string): Promise<PageRow[]> {
  const result = await port.call('notion-query-data-sources', {
    data: { mode: 'rows', data_source_url: dataSourceUrl, limit: 100 },
  })
  if (result.isError) {
    throw failure('notion-query-data-sources', result)
  }

  return rowsOf(jsonOf(result)).rows
}

/** The oldest page of the repo and branch, if any. */
export function pickPage(rows: PageRow[], repo: string, branch: string): PageRow | undefined {
  return rows
    .filter(row => row.repo === repo && row.branch === branch)
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime))[0]
}

export async function createPage(
  port: NotionPort,
  dataSourceUrl: string,
  repo: string,
  branch: string,
): Promise<{ id: string; url: string }> {
  const result = await port.call('notion-create-pages', {
    parent: { type: 'data_source_id', data_source_id: dataSourceUrl.replace('collection://', '') },
    pages: [{ properties: { Name: pageTitle(repo, branch), Repo: repo, Branch: branch }, content: initialContent() }],
    allow_async: false,
  })
  const created = (jsonOf(result) as { pages?: { id?: unknown; url?: unknown }[] } | undefined)?.pages?.[0]
  if (result.isError || typeof created?.id !== 'string' || typeof created.url !== 'string') {
    throw failure('notion-create-pages', result)
  }

  return { id: normalizeId(created.id), url: created.url.replace(/\?.*$/, '') }
}

export async function fetchPage(port: NotionPort, pageId: string): Promise<DevNotesPage> {
  const result = await port.call('notion-fetch', { id: pageId })
  const page = result.isError ? undefined : parsePage(jsonOf(result))
  if (page === undefined) {
    throw failure('notion-fetch', result)
  }

  return page
}

export function hasChanged(shown: DevNotesPage, fresh: DevNotesPage): boolean {
  return shown.lastEditedAt !== fresh.lastEditedAt || shown.content !== fresh.content
}

/**
 * Rewrites one section: re-reads the page first and writes nothing when it
 * changed since `shown`; the write replaces the section block as read, so a
 * change made in between makes Notion refuse it, read as a conflict too.
 */
export async function writeSection(
  port: NotionPort,
  shown: DevNotesPage,
  sectionName: string,
  change: (entries: DevNotesEntry[]) => DevNotesEntry[],
): Promise<WriteOutcome> {
  let fresh: DevNotesPage
  try {
    fresh = await fetchPage(port, shown.id)
  } catch (error) {
    return { kind: 'error', message: messageOf(error) }
  }
  if (hasChanged(shown, fresh)) {
    return { kind: 'conflict' }
  }
  const section = fresh.sections.find(one => one.name === sectionName)
  if (section === undefined) {
    return { kind: 'error', message: `section « ${sectionName} » absente de la page` }
  }
  const block = serializeSection(section, change(section.entries))
  if (block === section.block) {
    return { kind: 'written', page: fresh }
  }
  let result: McpResult
  try {
    result = await port.call('notion-update-page', {
      page_id: fresh.id,
      command: 'update_content',
      content_updates: [{ old_str: section.block, new_str: block }],
      allow_async: false,
    })
  } catch (error) {
    return { kind: 'error', message: messageOf(error) }
  }
  if (result.isError) {
    return /match/i.test(textOf(result)) ? { kind: 'conflict' } : { kind: 'error', message: textOf(result).slice(0, 200) }
  }
  try {
    return { kind: 'written', page: await fetchPage(port, fresh.id) }
  } catch {
    return { kind: 'written', page: undefined }
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
