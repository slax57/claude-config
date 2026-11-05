// An in-memory Notion connector answering the tools dev-notes calls, in the
// shapes the real connector returns (observed on a test database).
type Block = { type: string; text?: string }
type Result = { content: Block[]; isError: boolean }

export const DATABASE_ID = '11111111111141118111111111111111'
export const DATA_SOURCE_ID = '22222222-2222-4222-8222-222222222222'
export const VIEW_ID = '33333333-3333-4333-8333-333333333333'

export type FakePage = {
  id: string
  repo: string
  branch: string
  content: string
  createdTime: string
  edits: number
}

function dashed(id: string): string {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
}

function urlOf(id: string): string {
  return `https://app.notion.com/p/${id}`
}

function text(value: unknown, isError = false): Result {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError }
}

export class FakeNotion {
  pages: FakePage[] = []
  calls: { tool: string; args: Record<string, unknown> }[] = []
  isWriteFailing = false
  private next = 0

  addPage(repo: string, branch: string, content: string, createdTime = '2026-01-01 00:00:00Z'): FakePage {
    this.next += 1
    const id = `aaaaaaaa${String(this.next).padStart(4, '0')}4aaa8aaaaaaaaaaaaaaa`
    const page = { id, repo, branch, content, createdTime, edits: 0 }
    this.pages.push(page)
    return page
  }

  pageText(page: FakePage): string {
    return [
      `Here is the result of "fetch" for the Page with URL ${urlOf(page.id)} as of 2026-11-05T13:16:49.666Z:`,
      `<page url="${urlOf(page.id)}">`,
      '<ancestor-path>',
      `<parent-data-source url="collection://${DATA_SOURCE_ID}" name="Dev notes"/>`,
      `<ancestor-2-database url="${urlOf(DATABASE_ID)}" title=""/>`,
      '</ancestor-path>',
      '<content>',
      page.content,
      '</content>',
      '</page>',
    ].join('\n')
  }

  handle(tool: string, args: Record<string, unknown>): Result {
    this.calls.push({ tool, args })
    switch (tool) {
      case 'notion-get-self':
        return text({ user: { id: 'u' } })
      case 'notion-fetch':
        return this.fetch(String(args.id ?? ''))
      case 'notion-query-data-sources':
        return this.query(args.data as Record<string, unknown>)
      case 'notion-create-pages':
        return this.create(args)
      case 'notion-update-page':
        return this.updatePage(args)
      default:
        return text(`unknown tool ${tool}`, true)
    }
  }

  private fetch(id: string): Result {
    const bare = id.replace(/-/g, '')
    if (bare === DATABASE_ID) {
      return text({
        metadata: { type: 'database' },
        title: 'Dev notes',
        url: urlOf(DATABASE_ID),
        text: `<database url="{{${urlOf(DATABASE_ID)}}}">\n<data-source url="{{collection://${DATA_SOURCE_ID}}}">\n</data-source>\n<view url="{{view://${VIEW_ID}}}">\n</view>\n</database>`,
      })
    }
    const page = this.pages.find(one => one.id === bare)
    if (page === undefined) {
      return text('Could not find page', true)
    }

    return text({
      metadata: { type: 'page' },
      title: `${page.repo} · ${page.branch}`,
      url: `${urlOf(page.id)}?pvs=204`,
      text: this.pageText(page),
      page_last_edited_at: `2026-11-05T13:00:00.${String(page.edits).padStart(3, '0')}Z`,
    })
  }

  private query(data: Record<string, unknown>): Result {
    const sorted = [...this.pages].sort((a, b) => a.createdTime.localeCompare(b.createdTime))
    const params = Array.isArray(data.params) ? data.params : []
    const limit = Number(params[0] ?? 100)
    const offset = Number(params[1] ?? 0)
    const rows = sorted.slice(offset, offset + limit).map(page => ({
      url: `https://app.notion.com/${page.id}`,
      createdTime: page.createdTime,
      Repo: page.repo,
      Branch: page.branch,
    }))

    return text({ results: rows, has_more: offset + limit < sorted.length })
  }

  private create(args: Record<string, unknown>): Result {
    const [spec] = args.pages as { properties: Record<string, string>; content: string }[]
    const page = this.addPage(spec?.properties.Repo ?? '', spec?.properties.Branch ?? '', spec?.content ?? '', '2026-11-05 13:00:00Z')

    return text({ pages: [{ id: dashed(page.id), url: `${urlOf(page.id)}?pvs=204`, properties: spec?.properties }] })
  }

  private updatePage(args: Record<string, unknown>): Result {
    if (this.isWriteFailing) {
      return text('Internal server error', true)
    }
    const page = this.pages.find(one => one.id === String(args.page_id).replace(/-/g, ''))
    const [update] = args.content_updates as { old_str: string; new_str: string }[]
    if (page === undefined || update === undefined) {
      return text('Could not find page', true)
    }
    const at = page.content.indexOf(update.old_str)
    if (at === -1 || page.content.indexOf(update.old_str, at + 1) !== -1) {
      return text('No match found for old_str', true)
    }
    page.content = page.content.slice(0, at) + update.new_str + page.content.slice(at + update.old_str.length)
    page.edits += 1

    return text({ page_id: page.id })
  }
}
