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
}

export interface ExperienceNode {
  resourceId: string
  name: string
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
    }))
    .filter((e: ExperienceNode) => e.resourceId)
}

function extractUrlFromEmbedCode(html: string): string {
  const match = html.match(/data-url="([^"]+)"/)
  return match?.[1] ?? ''
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (
  event: AppActionEvent,
  context: FunctionContext
): Promise<Record<string, unknown>> => {
  try {
    return await run(event, context)
  } catch (err: any) {
    return { error: `Unexpected function error: ${err?.message ?? String(err)}` }
  }
}

async function run(
  event: AppActionEvent,
  context: FunctionContext
): Promise<Record<string, unknown>> {
  const apiKey = context.appInstallationParameters?.cerosApiKey
  if (!apiKey) {
    return { error: 'Ceros API key is not configured. Please set it in the app configuration.' }
  }

  const { action, folderId, resourceId } = event.body as {
    action?: string
    folderId?: string
    resourceId?: string
  }

  switch (action) {
    case 'getFolderTree': {
      const accountResp = await cerosGet('/accounts/current-account', apiKey)
      if (accountResp._error) return { error: accountResp._error }

      const { accountResourceId } = accountResp
      if (!accountResourceId) return { error: 'Could not determine account resource ID.' }

      const treeResp = await cerosGet(`/accounts/${accountResourceId}/folder-tree`, apiKey)
      if (treeResp._error) return { error: treeResp._error }

      return { folders: normalizeFolderTree(treeResp) }
    }

    case 'getFolderExperiences': {
      if (!folderId) return { error: 'folderId is required' }

      const resp = await cerosGet(`/folder/${folderId}/experiences`, apiKey)
      if (resp._error) return { error: resp._error }

      return { experiences: normalizeExperiences(resp) }
    }

    case 'getEmbedCode': {
      if (!resourceId) return { error: 'resourceId is required' }

      const resp = await cerosGet(`/experiences/${resourceId}/embed-codes`, apiKey)
      if (resp._error) return { error: resp._error }

      const embedCode: string = resp.fullHeightEmbedCode || resp.scrollableEmbedCode || ''
      const url = extractUrlFromEmbedCode(embedCode)

      return { embedCode, url }
    }

    default:
      return { error: `Unknown action: ${String(action)}` }
  }
}
