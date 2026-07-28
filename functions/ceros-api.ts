// Contentful Function handler for the Ceros API experience chooser.
// Invoked via the CerosApi App Action (type: function-invocation).
// The API key is read from context.appInstallationParameters and never
// exposed to the browser.

// Inline types matching @contentful/node-apps-toolkit's shapes.
type InstallationParams = { cerosApiKey?: string }

type AppActionEvent = {
  type: 'appaction.call'
  body: Record<string, unknown>
  headers: Record<string, string | number>
}

type FunctionContext = {
  spaceId: string
  environmentId: string
  appInstallationParameters: InstallationParams
  cmaClientOptions?: unknown
}

export interface FolderNode {
  resourceId: string
  name: string
  isFlexFolder: boolean
  children: FolderNode[]
}

export interface ExperienceNode {
  resourceId: string
  name: string
  thumbnailUrl?: string
  isFlexExperience: boolean
}

export interface Paging {
  total: number
  page: number
  pages: number
  pageSize: number
  next?: string
  previous?: string
}

// Allowed query keys per action. Anything else in the JSON `query` is dropped
// before forwarding, so the picker can pass query params freely without the
// function becoming an open proxy.
const QUERY_WHITELIST: Record<string, string[]> = {
  getFolderTree: ['folder', 'depth'],
  getFolderExperiences: ['page', 'pageSize', 'search', 'sort', 'offset'],
}

// Parses the JSON `query` field off the app-action body and returns a
// URLSearchParams containing only the whitelisted keys for `action`.
function parseQuery(action: string, rawQuery: unknown): URLSearchParams {
  const params = new URLSearchParams()
  const allowed = QUERY_WHITELIST[action] ?? []
  if (typeof rawQuery !== 'string' || rawQuery.length === 0) return params
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawQuery)
  } catch {
    return params
  }
  for (const key of allowed) {
    const value = parsed[key]
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  return params
}

// ── API helpers ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://rest.ceros.com'
const API_VERSION = '2026-02-25-12-00'

function makeHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'X-Ceros-Api-Version': API_VERSION,
    'X-Ceros-Plugin': 'contentful',
  }
}

async function cerosGet(
  path: string,
  apiKey: string
): Promise<any> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: makeHeaders(apiKey) })
  if (!response.ok) {
    const text = await response.text()
    return { _error: `Ceros API error (${response.status}): ${text}` }
  }
  return response.json()
}

// ── Normalisation helpers ────────────────────────────────────────────────────

function normalizeArray(data: any): any[] {
  if (Array.isArray(data)) {
    // Tuple shape: [[...items], totalCount, "folder"]
    if (data.length > 0 && Array.isArray(data[0])) return data[0]
    return data
  }
  return data?.resources ?? data?.data ?? data?.items ?? []
}

function normalizeFolderTree(data: any): FolderNode[] {
  console.log('Normalize folder tree')
  return normalizeArray(data)
    .map((f: any) => ({
      resourceId: String(f.resourceId ?? f.id ?? ''),
      name: String(f.name ?? f.title ?? ''),
      isFlexFolder: Boolean(f.isFlexFolder),
      children: Array.isArray(f.children) ? normalizeFolderTree(f.children) : [],
    }))
    .filter((f: FolderNode) => f.resourceId && f.name !== 'Account Templates')
}

function normalizeExperiences(data: any): ExperienceNode[] {
  console.log('Normalize experiences')
  const items = normalizeArray(data)
  return items
    .filter(
      (e: any) =>
        e.status === 'published' &&
        !e.isTemplate &&
        !e.isPasswordProtected &&
        !e.isSSOProtected
    )
    .map((e: any) => ({
      resourceId: String(e.resourceId ?? e.id ?? e.experienceId ?? ''),
      name: String(e.name ?? e.title ?? ''),
      thumbnailUrl: e.thumbnailUrl ?? e.thumbnail ?? undefined,
      isFlexExperience: Boolean(e.isFlexExperience),
    }))
    .filter((e: ExperienceNode) => e.resourceId)
}

function extractPaging(resp: any): Paging | null {
  const p = resp?.paging
  if (!p || typeof p.total !== 'number') return null
  return {
    total: p.total,
    page: p.page,
    pages: p.pages,
    pageSize: p.pageSize,
    next: p.next,
    previous: p.previous,
  }
}

function extractUrlFromEmbedCode(html: string): string {
  const dataUrl = html.match(/data-url="([^"]+)"/)
  if (dataUrl?.[1]) return dataUrl[1]

  const dataCeros = html.match(/data-ceros-experience="([^"]+)"/)
  if (dataCeros?.[1]) return dataCeros[1]

  const iframeSrc = html.match(/<iframe[^>]+src="([^"]+)"/)
  if (iframeSrc?.[1]) return iframeSrc[1]

  return ''
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (
  event: AppActionEvent,
  context: FunctionContext
): Promise<Record<string, unknown>> => {
  console.log('Handler start')
  try {
    const result = await run(event, context)
    console.log('Hander end')
    return result
  } catch (err: any) {
    return { error: `Unexpected function error: ${err?.message ?? String(err)}` }
  }
}

async function run(
  event: AppActionEvent,
  context: FunctionContext
): Promise<Record<string, unknown>> {
  console.log('Run start')
  const apiKey = context.appInstallationParameters?.cerosApiKey
  if (!apiKey) {
    return { error: 'Ceros API key is not configured. Please set it in the app configuration.' }
  }

  const { action, folderId, resourceId, query } = event.body as {
    action?: string
    folderId?: string
    resourceId?: string
    query?: string
  }

  switch (action) {
    case 'getFolderTree': {
      console.log('Get Folder Tree start')
      const accountResp = await cerosGet('/accounts/current-account', apiKey)
      if (accountResp._error) return { error: accountResp._error }

      const { accountResourceId } = accountResp
      if (!accountResourceId) return { error: 'Could not determine account resource ID.' }

      const qs = parseQuery('getFolderTree', query)
      if (!qs.has('depth')) qs.set('depth', '2') // depth is required by the API
      const treeResp = await cerosGet(
        `/accounts/${accountResourceId}/folder-tree?${qs.toString()}`,
        apiKey
      )
      if (treeResp._error) return { error: treeResp._error }

      console.log('Get Folder Tree end')
      return { data: normalizeFolderTree(treeResp), paging: null }
    }

    case 'getFolderExperiences': {
      console.log('Get Folder Experiences start')
      if (!folderId) return { error: 'folderId is required' }

      const qs = parseQuery('getFolderExperiences', query)
      const resp = await cerosGet(
        `/folder/${folderId}/experiences?${qs.toString()}`,
        apiKey
      )
      if (resp._error) return { error: resp._error }

      console.log('Get Folder Experiences end')
      return { data: normalizeExperiences(resp), paging: extractPaging(resp) }
    }

    case 'getEmbedCode': {
      if (!resourceId) return { error: 'resourceId is required' }

      const resp = await cerosGet(`/experiences/${resourceId}/embed-codes`, apiKey)
      if (resp._error) return { error: resp._error }

      const primary: string =
        resp.fullHeightEmbedCode || resp.scrollableEmbedCode || resp.inlineEmbedCode || ''
      return {
        data: {
          fullHeightEmbedCode: resp.fullHeightEmbedCode,
          scrollableEmbedCode: resp.scrollableEmbedCode,
          inlineEmbedCode: resp.inlineEmbedCode,
          url: extractUrlFromEmbedCode(primary),
        },
        paging: null,
      }
    }

    default:
      return { error: `Unknown action: ${String(action)}` }
  }
}
