// What hides the notes database from the model's Notion calls: pure checks
// over a set of masked IDs, applied by the `tool.call` hook in register.tsx.
import { idsIn } from './data'
import type { McpBlock } from './data'

export const NEUTRAL = 'Ressource indisponible.'

/** Tools whose server-side agent reads the workspace, out of reach of an ID filter. */
const ALWAYS_DENIED = new Set(['notion-spawn-session', 'notion-send-message-to-session'])

const RESERVED_KEYS = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta'])

/** `mcp__<server>__<tool>`: the server and the tool, when it is an MCP tool. */
export function splitToolName(tool: string): { server: string; name: string } | undefined {
  const match = /^mcp__(.+?)__(.+)$/.exec(tool)

  return match === null ? undefined : { server: match[1] ?? '', name: match[2] ?? '' }
}

export function isNotionTool(tool: string): boolean {
  return /notion/i.test(splitToolName(tool)?.server ?? '')
}

export function isAlwaysDenied(tool: string): boolean {
  return ALWAYS_DENIED.has(splitToolName(tool)?.name ?? '')
}

/** The call's own arguments, without the envelope the engine adds. */
export function argumentsOf(e: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(e).filter(([key]) => !RESERVED_KEYS.has(key)))
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableJson(inner)}`).join(',')}}`
  }

  return JSON.stringify(value) ?? 'null'
}

/** Names a call the way the mod's own calls are recorded: tool name and arguments. */
export function callKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName} ${stableJson(args)}`
}

export function mentionsMasked(text: string, mask: ReadonlySet<string>): boolean {
  return idsIn(text).some(id => mask.has(id))
}

/**
 * One text block of a result with the masked entries taken out: list entries
 * naming a masked ID dropped, and in a fetched page that is not itself masked
 * the lines naming one. Undefined when nothing safe can be kept.
 */
export function scrubText(text: string, mask: ReadonlySet<string>): string | undefined {
  if (!mentionsMasked(text, mask)) {
    return text
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return undefined
  }
  const scrubbed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      scrubbed[key] = value.filter(entry => !mentionsMasked(JSON.stringify(entry) ?? '', mask))
    } else if (key === 'text' && typeof value === 'string') {
      const lines = scrubPageText(value, mask)
      if (lines === undefined) {
        return undefined
      }
      scrubbed[key] = lines
    } else {
      scrubbed[key] = value
    }
  }
  const out = JSON.stringify(scrubbed)

  return mentionsMasked(out, mask) ? undefined : out
}

function scrubPageText(text: string, mask: ReadonlySet<string>): string | undefined {
  const ancestry = /<ancestor-path>[\s\S]*?<\/ancestor-path>/.exec(text)?.[0] ?? ''
  const head = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  if (mentionsMasked(ancestry, mask) || mentionsMasked(head, mask)) {
    return undefined
  }

  return text
    .split('\n')
    .filter(line => !mentionsMasked(line, mask))
    .join('\n')
}

/** The result blocks with masked entries taken out, `blocks` itself when untouched, undefined when nothing safe is left. */
export function scrubBlocks(blocks: readonly McpBlock[], mask: ReadonlySet<string>): readonly McpBlock[] | undefined {
  let isChanged = false
  const out: McpBlock[] = []
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      const text = scrubText(block.text, mask)
      if (text === undefined) {
        return undefined
      }
      isChanged = isChanged || text !== block.text
      out.push(text === block.text ? block : { ...block, text })
    } else if (mentionsMasked(JSON.stringify(block) ?? '', mask)) {
      return undefined
    } else {
      out.push(block)
    }
  }

  return isChanged ? out : blocks
}

export function neutralBlocks(): McpBlock[] {
  return [{ type: 'text', text: NEUTRAL }]
}
