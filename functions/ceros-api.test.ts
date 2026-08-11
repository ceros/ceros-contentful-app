import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handler } from './ceros-api'

type JsonResponse = { ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }

function jsonOk(body: any): JsonResponse {
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

function makeEvent(body: Record<string, unknown>) {
    return { type: 'appaction.call' as const, body, headers: {} }
}

function makeContext(cerosApiKey?: string) {
    return {
        spaceId: 'space',
        environmentId: 'master',
        appInstallationParameters: cerosApiKey ? { cerosApiKey } : {},
    }
}

describe('ceros-api function — getEmbedCode', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
    afterEach(() => vi.unstubAllGlobals())

    it('reads url and title from the response instead of scraping the embed HTML', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonOk({
                viewUrl: 'https://ceros-qa.ceros.site/fifth-brass-storm',
                title: 'Fifth Brass Storm',
                assetBaseUrl: 'https://assets.ceros.site',
                experienceAlias: '',
                isPageOverHeightHomogeneous: false,
                fullHeightEmbedCode: '<iframe src="https://somewhere-else.example/decoy"></iframe>',
                inlineEmbedCode: '<div data-flex-inline></div>',
            }) as any
        )

        const result = await handler(makeEvent({ action: 'getEmbedCode', resourceId: 'exp-1' }), makeContext('key') as any)

        // The decoy src in fullHeightEmbedCode is what the old scraper would
        // have returned. viewUrl is the correct answer.
        expect((result.data as any).url).toBe('https://ceros-qa.ceros.site/fifth-brass-storm')
        expect((result.data as any).title).toBe('Fifth Brass Storm')
        expect((result.data as any).inlineEmbedCode).toBe('<div data-flex-inline></div>')
    })

    it('still requires an API key for getEmbedCode', async () => {
        const result = await handler(makeEvent({ action: 'getEmbedCode', resourceId: 'exp-1' }), makeContext() as any)
        expect(String(result.error)).toContain('API key is not configured')
        expect(fetch).not.toHaveBeenCalled()
    })

    it('still requires an API key for getFolderTree', async () => {
        const result = await handler(makeEvent({ action: 'getFolderTree' }), makeContext() as any)
        expect(String(result.error)).toContain('API key is not configured')
        expect(fetch).not.toHaveBeenCalled()
    })

    it('still requires an API key for getFolderExperiences', async () => {
        const result = await handler(makeEvent({ action: 'getFolderExperiences', folderId: 'f1' }), makeContext() as any)
        expect(String(result.error)).toContain('API key is not configured')
        expect(fetch).not.toHaveBeenCalled()
    })
})

const MANIFEST_URL = 'https://ceros-qa.ceros.site/fifth-brass-storm/manifest.v1.json'
// Deliberately a different path than FLEX_PAGE + '/manifest.v1.json', so a
// concatenating implementation can't accidentally match it.
const DISTINCT_MANIFEST_URL = 'https://ceros-qa.ceros.site/some-other-path/manifest.v1.json'
const FLEX_PAGE = 'https://ceros-qa.ceros.site/fifth-brass-storm'
const STUDIO_PAGE = 'https://view.ceros.com/ceros-qa/untitled-85/p/1'

// `url` mirrors fetch's Response.url — the final URL after any redirects —
// so tests can simulate a HEAD landing off-host.
function headResponse(headers: Record<string, string>, url: string = FLEX_PAGE) {
    return {
        ok: true,
        status: 200,
        url,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
        json: async () => ({}),
        text: async () => '',
    }
}

const MANIFEST_BODY = {
    pageMetadata: { title: 'Fifth Brass Storm', canonicalUrl: `${FLEX_PAGE}/page-1`, locale: 'en', seoMode: 'default' },
    deliveryModes: {
        iframe: { snippet: '<iframe src="https://ceros-qa.ceros.site/fifth-brass-storm"></iframe>' },
        inline: { snippet: '<div data-flex-inline data-flex-manifest-url="' + MANIFEST_URL + '" data-embed-height="auto"></div><script src="https://assets.ceros.site/js/flex-client.js"></script>' },
    },
}

describe('ceros-api function — resolveExperience', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
    afterEach(() => vi.unstubAllGlobals())

    it('routes to Flex when x-flex-manifest is present and returns both variants', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockResolvedValueOnce(jsonOk(MANIFEST_BODY) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.isFlex).toBe(true)
        expect(data.name).toBe('Fifth Brass Storm')
        expect(data.embedCodes.fullHeight).toContain('<iframe')
        expect(data.embedCodes.inline).toContain('data-flex-inline')
        // The experience root, NOT the page-scoped canonicalUrl.
        expect(data.url).toBe(FLEX_PAGE)
    })

    it('needs no API key', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockResolvedValueOnce(jsonOk(MANIFEST_BODY) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect(result.error).toBeUndefined()
    })

    it('fetches the manifest URL from the header, never a constructed one', async () => {
        // The header value here is NOT FLEX_PAGE + '/manifest.v1.json' — if the
        // implementation ever starts string-concatenating the manifest URL
        // instead of reading this header, this assertion catches it.
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': DISTINCT_MANIFEST_URL }) as any)
            .mockResolvedValueOnce(jsonOk(MANIFEST_BODY) as any)

        await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect(vi.mocked(fetch).mock.calls[1][0]).toBe(DISTINCT_MANIFEST_URL)
    })

    it('routes to Studio oEmbed when x-flex-manifest is absent', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({}, STUDIO_PAGE) as any)
            .mockResolvedValueOnce(jsonOk({
                type: 'rich', url: null, title: 'Untitled 85',
                html: '<div class="ceros-experience"></div>', embedType: 'full-height',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: STUDIO_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.isFlex).toBe(false)
        expect(data.name).toBe('Untitled 85')
        expect(data.embedCodes.fullHeight).toContain('ceros-experience')
        expect(data.embedCodes.inline).toBeUndefined()
        // oEmbed's url comes back null, and /p/1 is stripped to the root.
        expect(data.url).toBe('https://view.ceros.com/ceros-qa/untitled-85')
    })

    it('keys a scrollable Studio experience as scrollable, not fullHeight', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({}, STUDIO_PAGE) as any)
            .mockResolvedValueOnce(jsonOk({
                url: null, title: 'Scrollable One',
                html: '<div class="ceros-experience"></div>', embedType: 'scrollable',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: STUDIO_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.embedCodes.scrollable).toContain('ceros-experience')
        expect(data.embedCodes.fullHeight).toBeUndefined()
    })

    it('falls through to oEmbed when the manifest cannot be fetched, and flags inline unavailable', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(jsonOk({
                url: null, title: 'Fifth Brass Storm',
                html: '<iframe src="https://ceros-qa.ceros.site/fifth-brass-storm"></iframe>', embedType: 'full-height',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.isFlex).toBe(true)
        expect(data.embedCodes.fullHeight).toContain('<iframe')
        expect(data.embedCodes.inline).toBeUndefined()
        expect(data.inlineUnavailable).toBe(true)
    })

    it('keys the degraded Flex oEmbed fallback as fullHeight when the response has no embedType field', async () => {
        // Live check: the Flex /oembed route returns no embedType at all, so
        // the `?? 'fullHeight'` default is what actually fires in production
        // on this path — not the 'full-height' string used elsewhere in these
        // fixtures.
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(jsonOk({
                url: null, title: 'Fifth Brass Storm',
                html: '<iframe src="https://ceros-qa.ceros.site/fifth-brass-storm"></iframe>',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.embedCodes.fullHeight).toContain('<iframe')
        expect(data.embedCodes.scrollable).toBeUndefined()
    })

    it('returns fullHeight and flags inline unavailable when the manifest has iframe but no inline delivery mode', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockResolvedValueOnce(jsonOk({
                pageMetadata: { title: 'X' },
                deliveryModes: { iframe: { snippet: '<iframe src="https://ceros-qa.ceros.site/x"></iframe>' } },
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.embedCodes.fullHeight).toContain('<iframe')
        expect(data.embedCodes.inline).toBeUndefined()
        expect(data.inlineUnavailable).toBe(true)
        // The manifest already answered fullHeight — no oEmbed round trip.
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    })

    it('falls through to oEmbed when the manifest has no usable delivery modes at all', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockResolvedValueOnce(jsonOk({ pageMetadata: { title: 'X' }, deliveryModes: {} }) as any)
            .mockResolvedValueOnce(jsonOk({
                url: null, title: 'X', html: '<iframe></iframe>', embedType: 'full-height',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect((result.data as any).inlineUnavailable).toBe(true)
        expect((result.data as any).embedCodes.inline).toBeUndefined()
    })

    it('falls through to oEmbed on malformed manifest JSON', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }) as any)
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') }, text: async () => '' } as any)
            .mockResolvedValueOnce(jsonOk({
                url: null, title: 'X', html: '<iframe></iframe>', embedType: 'full-height',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect((result.data as any).inlineUnavailable).toBe(true)
    })

    it('errors when the HEAD request itself fails', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('network'))

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect(String(result.error)).toContain('experience URL is invalid')
    })

    it('gives a specific message for an unpublished Flex experience', async () => {
        // Documented contract: x-flex-manifest appears only on a 200 for a
        // genuine PUBLISHED Flex experience, so an unpublished one routes to the
        // Studio branch. x-experience-type is the only signal that says why.
        vi.mocked(fetch).mockResolvedValueOnce(headResponse({ 'x-experience-type': 'flex' }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect(String(result.error)).toContain("isn't published")
        // It must not waste an oEmbed round trip on a known-unpublished page.
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    })

    it('errors when url is missing', async () => {
        const result = await handler(makeEvent({ action: 'resolveExperience' }), makeContext() as any)
        expect(String(result.error)).toContain('url is required')
    })

    it('rejects a pasted URL on a disallowed host before making any request', async () => {
        // The app action can be invoked directly through the CMA, bypassing
        // the browser-side gate in src/oembed.ts entirely — this must gate
        // independently, server-side, before ever touching the network.
        const result = await handler(
            makeEvent({ action: 'resolveExperience', url: 'https://evil.example.com/experience' }),
            makeContext() as any
        )
        expect(String(result.error)).toContain('invalid')
        expect(fetch).not.toHaveBeenCalled()
    })

    it('takes the degraded path when the manifest header points off-host, without fetching it', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': 'https://evil.example.com/manifest.v1.json' }) as any)
            .mockResolvedValueOnce(jsonOk({
                url: null, title: 'Fifth Brass Storm',
                html: '<iframe src="https://ceros-qa.ceros.site/fifth-brass-storm"></iframe>', embedType: 'full-height',
            }) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        const data = result.data as any

        expect(data.isFlex).toBe(true)
        expect(data.inlineUnavailable).toBe(true)
        expect(data.embedCodes.fullHeight).toContain('<iframe')
        // Exactly HEAD + oEmbed — the off-host manifest URL is never fetched.
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
        expect(vi.mocked(fetch).mock.calls[1][0]).not.toContain('evil.example.com')
    })

    it('resolves normally when the HEAD response url is empty, falling back to the pasted url', async () => {
        // Response.url is legitimately '' on some runtimes/polyfills. There's no
        // redirect information to check in that case, so the re-validation
        // should fall back to the already-validated pasted url instead of
        // treating '' as an off-host redirect.
        vi.mocked(fetch)
            .mockResolvedValueOnce(headResponse({ 'x-flex-manifest': MANIFEST_URL }, '') as any)
            .mockResolvedValueOnce(jsonOk(MANIFEST_BODY) as any)

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)

        expect(result.error).toBeUndefined()
        expect((result.data as any).isFlex).toBe(true)
        expect((result.data as any).embedCodes.fullHeight).toContain('<iframe')
    })

    it('rejects when the HEAD response redirected off-host', async () => {
        // fetch() follows redirects by default, so an allowlisted first hop
        // can still land on an unvalidated final URL.
        vi.mocked(fetch).mockResolvedValueOnce(
            headResponse({ 'x-flex-manifest': MANIFEST_URL }, 'https://evil.example.com/relocated') as any
        )

        const result = await handler(makeEvent({ action: 'resolveExperience', url: FLEX_PAGE }), makeContext() as any)
        expect(String(result.error)).toContain('invalid')
        // Rejected right after the HEAD — no manifest or oEmbed fetch follows.
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    })
})
