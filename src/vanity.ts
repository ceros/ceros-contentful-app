// Discovery for an experience pasted from a vanity domain.
//
// A vanity domain (look.acme.com) fronts a published Ceros experience, and this app
// cannot ask the Contentful Function what that host is serving: allowNetworks accepts
// `*.<label>.<tld>`, a fully-qualified host, or an IP — never `*` — and it is validated
// at upload time, so a customer's own apex can never be listed. Discovery therefore has
// to happen in the browser.
//
// PRIMARY PATH — read `x-flex-manifest` off the pasted page. It names the canonical
// manifest URL, and the browser can read it only when the page response carries
// `Access-Control-Allow-Origin` (Expose-Headers alone is inert). It is the only path for
// a BARE vanity domain, whose root serves the domain's default experience:
// `<root>/manifest.v1.json` 404s.
//
// FALLBACK — fetch `<pasted-path>/manifest.v1.json`, which sends
// `Access-Control-Allow-Origin: *` even through a vanity host, and read two identifier
// fields out of it. It needs a path, so it cannot serve a bare domain.
//
// The fallback deliberately never reads deliveryModes / scripts / styles / assets. Ceros
// documents guessing `<pasted-url>/manifest.v1.json` as precisely the injection risk the
// x-flex-manifest header exists to prevent: a spoofed page could hand back a snippet
// loading attacker-controlled JS. Reading two identifier strings is not that attack —
// once the canonical URL is known, resolveExperience takes over and every snippet comes
// from the canonical manifest reached the designed way (HEAD the canonical page, read
// x-flex-manifest, fetch that). The worst a spoofed page can do is name a real experience
// in this account, which the confirmation screen shows the author before anything is
// committed. The same reasoning covers a spoofed x-flex-manifest on the primary path,
// which is additionally pinned to `<accountSlug>.ceros.site` before it is believed.

// Flex publishes to `<accountSlug>.ceros.site`. Hardcoded, as elsewhere in the app:
// this build targets production (rest.ceros.com), and the stage/dev player hosts
// (`*.cerosstage.site` / `*.cerosdev.site`) are not reachable from it.
const FLEX_PLAYER_HOST = 'ceros.site'

const FLEX_MANIFEST_HEADER = 'x-flex-manifest'
const MANIFEST_FILENAME = 'manifest.v1.json'

// accountSlug and slug arrive as untrusted JSON from a pasted host and are
// interpolated straight into a URL, so they are VALIDATED rather than escaped —
// a value carrying '/', '.', or '..' has to be rejected outright, not encoded into
// something that merely looks safe.
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

// The manifest's `experience` object is the 4th top-level key and lands within the
// first ~250 bytes, while the whole document runs from ~1.3 MB to several MB. So the
// body is streamed and abandoned the moment that object has been read. A Range
// request cannot do this job: the route's preflight allows only Content-Type, and
// the origin ignores Range and returns the full body anyway.
const HEAD_BYTE_LIMIT = 16 * 1024

// A pasted vanity host that never responds would otherwise hang the paste button.
const FETCH_TIMEOUT_MS = 10_000

// Per request rather than per resolution, so a slow page check cannot starve the
// manifest fallback of its budget.
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
        return await run(controller.signal)
    } finally {
        clearTimeout(timeout)
    }
}

// Walks a JSON fragment from the '{' at `start` to its matching '}', ignoring braces
// that appear inside strings. Returns null when the fragment ends first, which means
// "keep reading" rather than "malformed".
function sliceObject(text: string, start: number): string | null {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
        const char = text[i]

        if (inString) {
            if (escaped) escaped = false
            else if (char === '\\') escaped = true
            else if (char === '"') inString = false
            continue
        }

        if (char === '"') inString = true
        else if (char === '{') depth++
        else if (char === '}' && --depth === 0) return text.slice(start, i + 1)
    }

    return null
}

// Pulls the `experience` object out of a partial manifest. Returns null while the
// buffer is still too short — callers distinguish that from a hard failure by
// whether the stream has ended.
function readExperience(buffer: string): { accountSlug?: unknown; slug?: unknown } | null {
    const key = buffer.indexOf('"experience"')
    if (key === -1) return null

    const brace = buffer.indexOf('{', key)
    if (brace === -1) return null

    const fragment = sliceObject(buffer, brace)
    if (!fragment) return null

    try {
        return JSON.parse(fragment)
    } catch {
        return null
    }
}

// Reads at most HEAD_BYTE_LIMIT of the response, stopping as soon as the
// `experience` object is complete. Falls back to the whole body on runtimes where
// response.body is absent (jsdom without a stream polyfill, older Safari).
async function readExperienceFromResponse(response: Response) {
    const body = response.body
    if (!body?.getReader) {
        return readExperience(await response.text())
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (buffer.length < HEAD_BYTE_LIMIT) {
            const { done, value } = await reader.read()
            if (value) buffer += decoder.decode(value, { stream: true })

            const experience = readExperience(buffer)
            if (experience) return experience
            if (done) return null
        }
    } finally {
        // Stop the transfer rather than draining the remaining megabytes.
        await reader.cancel().catch(() => {})
    }

    return readExperience(buffer)
}

function isValidSlug(value: unknown): value is string {
    return typeof value === 'string' && SLUG_PATTERN.test(value)
}

function canonicalExperienceUrl(accountSlug: unknown, slug: unknown): string | null {
    if (!isValidSlug(accountSlug) || !isValidSlug(slug)) return null
    return `https://${accountSlug}.${FLEX_PLAYER_HOST}/${slug}`
}

function experiencePath(url: URL): string {
    return url.pathname.replace(/\/+$/, '')
}

// resolveVanityToCanonical cannot say why it returned null; callers use this to tell a
// bare domain apart when picking the message.
export function hasExperiencePath(pastedUrl: string): boolean {
    try {
        return experiencePath(new URL(pastedUrl.trim())) !== ''
    } catch {
        return false
    }
}

// Sends NO headers object. The page route has no preflight handler (OPTIONS on it 404s),
// so a single non-safelisted request header would fail the read in a way indistinguishable
// from the header being absent. Do not add one.
async function readManifestHeader(url: URL, signal: AbortSignal): Promise<string | null> {
    try {
        const response = await fetch(url.href, { method: 'HEAD', signal })
        if (!response.ok) return null
        return response.headers.get(FLEX_MANIFEST_HEADER)
    } catch {
        // A CORS rejection on the page must still leave the manifest fallback a chance.
        return null
    }
}

// The value is advertised by a host the author pasted, so nothing in it is trusted.
function canonicalFromManifestHeader(headerValue: string): string | null {
    let manifest: URL
    try {
        manifest = new URL(headerValue.trim())
    } catch {
        return null
    }

    if (manifest.protocol !== 'https:') return null

    // Exactly `<accountSlug>.ceros.site`: a deeper subdomain names no account.
    const labels = manifest.hostname.split('.')
    if (labels.length !== 3) return null
    if (`${labels[1]}.${labels[2]}` !== FLEX_PLAYER_HOST) return null
    const accountSlug = labels[0]

    // `<experience>/manifest.v1.json` or `<experience>/<page>/manifest.v1.json`.
    const segments = manifest.pathname.split('/').filter(Boolean)
    if (segments.length < 2 || segments.length > 3) return null
    if (segments[segments.length - 1] !== MANIFEST_FILENAME) return null

    return canonicalExperienceUrl(accountSlug, segments[0])
}

async function canonicalFromManifestBody(url: URL, signal: AbortSignal): Promise<string | null> {
    const path = experiencePath(url)
    if (!path) return null

    // Published under both the experience and each page, so the pasted path is used as-is.
    const response = await fetch(`${url.origin}${path}/${MANIFEST_FILENAME}`, {
        signal,
        headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null

    const experience = await readExperienceFromResponse(response)
    if (!experience) return null

    return canonicalExperienceUrl(experience.accountSlug, experience.slug)
}

/**
 * Resolves a URL pasted from a vanity domain to the canonical experience URL
 * `https://<accountSlug>.ceros.site/<slug>`, which resolveExperience already accepts.
 *
 * Returns null for anything that is not a published Flex experience on that host —
 * a non-Flex (Studio) page, an unpublished one, a domain with no default experience,
 * a non-Ceros site, or identifiers that fail validation. Callers decide what to tell
 * the author; this module cannot tell those cases apart, because a vanity host exposes
 * nothing else readable.
 */
export async function resolveVanityToCanonical(pastedUrl: string): Promise<string | null> {
    let url: URL
    try {
        url = new URL(pastedUrl.trim())
    } catch {
        return null
    }

    if (url.protocol !== 'https:') return null

    try {
        const header = await withTimeout((signal) => readManifestHeader(url, signal))
        const canonical = header && canonicalFromManifestHeader(header)
        if (canonical) return canonical

        return await withTimeout((signal) => canonicalFromManifestBody(url, signal))
    } catch {
        // A CORS rejection, an abort, or a dead host are indistinguishable here and
        // all mean the same thing to the author: this is not a linkable experience.
        return null
    }
}
