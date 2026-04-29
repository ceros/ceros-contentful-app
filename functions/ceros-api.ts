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
  parentId?: string
}

export interface ExperienceNode {
  resourceId: string
  name: string
  thumbnailUrl?: string
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
  console.log('Normalize folder tree')
  return normalizeArray(data)
    .map((f: any) => {
      const parentRaw = f.parentResourceId ?? f.parentId ?? f.parent ?? null
      return {
        resourceId: String(f.resourceId ?? f.id ?? ''),
        name: String(f.name ?? f.title ?? ''),
        parentId: parentRaw != null ? String(parentRaw) : undefined,
      }
    })
    .filter((f: FolderNode) => f.resourceId && f.name !== 'Account Templates')
}

function normalizeExperiences(data: any): ExperienceNode[] {
  console.log('Normalize experiences')
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

  const { action, folderId, resourceId } = event.body as {
    action?: string
    folderId?: string
    resourceId?: string
  }

  switch (action) {
    case 'getFolderTree': {
      console.log('Get Folder Tree start')
      const accountResp = await cerosGet('/accounts/current-account', apiKey)
      if (accountResp._error) return { error: accountResp._error }

      const { accountResourceId } = accountResp
      if (!accountResourceId) return { error: 'Could not determine account resource ID.' }

      const treeResp = await cerosGet(`/accounts/${accountResourceId}/folder-tree`, apiKey)
      if (treeResp._error) return { error: treeResp._error }

      console.log('Get Folder Tree end')
      return { folders: normalizeFolderTree(treeResp) }
    }

    case 'getFolderExperiences': {
      console.log('Get Folder Experiences start')
      if (!folderId) return { error: 'folderId is required' }

      const resp = await cerosGet(`/folder/${folderId}/experiences`, apiKey)
      if (resp._error) return { error: resp._error }

      console.log('Get Folder Experiences end')
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
