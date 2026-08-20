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
  children: FolderNode[]
}

export interface ExperienceNode {
  resourceId: string
  name: string
  thumbnailUrl?: string
}

export interface Paging {
  total: number
  page: number
  pages: number
  pageSize: number
  next?: string
  previous?: string
}

// ── API helpers ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://rest.ceros.com'
const API_VERSION = '2025-12-10-09-11'

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
    if (response.status === 401) {
      return { _error: 'Ceros API key is invalid. Check it in the app configuration.' }
    }
    if (response.status === 403) {
      return { _error: 'There is a problem with your Ceros API key. Check it in the app configuration.' }
    }
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
  return data?.items ?? data?.data ?? []
}

function normalizeFolderTree(data: any): FolderNode[] {
  return normalizeArray(data)
    .map((f: any) => ({
      resourceId: String(f.resourceId ?? f.id ?? ''),
      name: String(f.name ?? f.title ?? ''),
      children: Array.isArray(f.children) ? normalizeFolderTree(f.children) : [],
    }))
    .filter((f: FolderNode) => f.resourceId && f.name !== 'Account Templates')
}

function normalizeExperiences(data: any): ExperienceNode[] {
  return normalizeArray(data)
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
  try {
    const result = await run(event, context)
    return result
  } catch (err: any) {
    return { error: `Unexpected function error: ${err?.message ?? String(err)}` }
  }
}

const NO_API_KEY_ERROR = 'Ceros API key is not configured. Please set it in the app configuration.'

// Actions that read the Ceros REST API need a configured key. Returning it
// rather than erroring here lets each action decide, so a future action that
// only reads public pages can work on installs that never set one.
function requireApiKey(context: FunctionContext): string | null {
  return context.appInstallationParameters?.cerosApiKey ?? null
}

async function run(
  event: AppActionEvent,
  context: FunctionContext
): Promise<Record<string, unknown>> {
  const { action, folderId, resourceId } = event.body as {
    action?: string
    folderId?: string
    resourceId?: string
  }

  switch (action) {
    case 'getFolderTree': {
      const apiKey = requireApiKey(context)
      if (!apiKey) return { error: NO_API_KEY_ERROR }

      const accountResp = await cerosGet('/accounts/current-account', apiKey)
      if (accountResp._error) return { error: accountResp._error }

      const { accountResourceId } = accountResp
      if (!accountResourceId) return { error: 'Could not determine account resource ID.' }

      const treeResp = await cerosGet(`/accounts/${accountResourceId}/folder-tree`, apiKey)
      if (treeResp._error) return { error: treeResp._error }

      return { data: normalizeFolderTree(treeResp), paging: null }
    }

    case 'getFolderExperiences': {
      const apiKey = requireApiKey(context)
      if (!apiKey) return { error: NO_API_KEY_ERROR }

      if (!folderId) return { error: 'folderId is required' }

      const resp = await cerosGet(`/folder/${folderId}/experiences`, apiKey)
      if (resp._error) return { error: resp._error }

      return { data: normalizeExperiences(resp), paging: extractPaging(resp) }
    }

    case 'getEmbedCode': {
      const apiKey = requireApiKey(context)
      if (!apiKey) return { error: NO_API_KEY_ERROR }

      if (!resourceId) return { error: 'resourceId is required' }

      const resp = await cerosGet(`/experiences/${resourceId}/embed-codes`, apiKey)
      if (resp._error) return { error: resp._error }

      const embedCode: string = resp.fullHeightEmbedCode || resp.scrollableEmbedCode || ''
      const url = extractUrlFromEmbedCode(embedCode)

      return { data: { embedCode, url }, paging: null }
    }

    default:
      return { error: `Unknown action: ${String(action)}` }
  }
}
