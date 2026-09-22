import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hasExperiencePath, resolveVanityToCanonical } from './vanity'

const encoder = new TextEncoder()

// The real manifest head, in the real key order: `experience` is the 4th top-level
// key and lands within the first ~250 bytes of a document over a megabyte long.
const manifestHead = (experience: Record<string, unknown>) =>
    JSON.stringify({
        schemaVersion: '1',
        publishedAt: '2026-06-19T13:37:39.757Z',
        flexVersion: '2026-08-27-15-41',
        experience,
        pageMetadata: { title: 'Page 1' },
    })

const EXPERIENCE = {
    slug: 'flex-experience',
    accountSlug: 'myaccount',
    pageSlug: 'page-1',
    pageNumber: 1,
    experienceResourceId: '6a04475c-n38640a18b9d7',
}

const CANONICAL = 'https://myaccount.ceros.site/flex-experience'
const ADVERTISED_MANIFEST = `${CANONICAL}/manifest.v1.json`

// A body that hands out pre-split chunks and records whether the consumer stopped
// early. Hand-rolled rather than a ReadableStream so the test asserts exactly the
// contract the implementation relies on — and so `cancel` is observable.
const makeBody = (chunks: string[]) => {
    const reader = {
        index: 0,
        cancelled: false,
        read: vi.fn(async () => {
            if (reader.index >= chunks.length) return { done: true, value: undefined }
            return { done: false, value: encoder.encode(chunks[reader.index++]) }
        }),
        cancel: vi.fn(async () => {
            reader.cancelled = true
        }),
    }
    return { body: { getReader: () => reader }, reader }
}

const okResponse = (chunks: string[]) => {
    const { body, reader } = makeBody(chunks)
    return { response: { ok: true, status: 200, body }, reader }
}

const headResponse = (manifestHeader: string | null, ok = true) => ({
    ok,
    status: ok ? 200 : 404,
    headers: {
        get: (name: string) =>
            name.toLowerCase() === 'x-flex-manifest' ? manifestHeader : null,
    },
})

// A page served without the Allow-Origin grant: the browser rejects the fetch outright.
const unreadablePage = () => new TypeError('Failed to fetch')

const mockFallback = (response: unknown) =>
    mockFetch.mockResolvedValueOnce(headResponse(null)).mockResolvedValue(response)

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('resolveVanityToCanonical', () => {
    describe('inputs it refuses without any request', () => {
        it.each([
            ['a non-parseable string', 'not-a-url'],
            ['an empty string', ''],
            ['http, not https', 'http://look.example.com/flex-experience'],
        ])('returns null for %s', async (_label, url) => {
            expect(await resolveVanityToCanonical(url)).toBeNull()
            expect(mockFetch).not.toHaveBeenCalled()
        })
    })

    describe('a bare custom domain', () => {
        it.each(['https://look.example.com', 'https://look.example.com/'])(
            'resolves %s to the default experience the page advertises',
            async (url) => {
                mockFetch.mockResolvedValue(headResponse(ADVERTISED_MANIFEST))

                expect(await resolveVanityToCanonical(url)).toBe(CANONICAL)
                expect(mockFetch).toHaveBeenCalledTimes(1)
            },
        )

        it('HEADs the pasted domain and sends no request headers', async () => {
            // The page route has no preflight handler to allow one.
            mockFetch.mockResolvedValue(headResponse(ADVERTISED_MANIFEST))

            await resolveVanityToCanonical('https://look.example.com')

            const [url, init] = mockFetch.mock.calls[0]
            expect(url).toBe('https://look.example.com/')
            expect(init.method).toBe('HEAD')
            expect(init.headers).toBeUndefined()
        })

        // Neither falls back: the manifest hangs off an experience path.
        it.each([
            ['the domain has no default experience configured', headResponse(null, false)],
            ['the root answers but advertises no manifest', headResponse(null)],
        ])('returns null when %s', async (_label, response) => {
            mockFetch.mockResolvedValue(response)

            expect(await resolveVanityToCanonical('https://look.example.com')).toBeNull()
            expect(mockFetch).toHaveBeenCalledTimes(1)
        })

        it('returns null for a domain that fronts no Ceros experience at all', async () => {
            mockFetch.mockRejectedValue(unreadablePage())

            expect(await resolveVanityToCanonical('https://look.example.com')).toBeNull()
        })
    })

    describe('the advertised manifest header', () => {
        it('is preferred over reading the manifest when the URL has a path', async () => {
            mockFetch.mockResolvedValue(headResponse(ADVERTISED_MANIFEST))

            expect(await resolveVanityToCanonical('https://look.example.com/flex-experience')).toBe(
                CANONICAL
            )
            expect(mockFetch).toHaveBeenCalledTimes(1)
        })

        it('resolves to the experience ROOT when it names a page', async () => {
            mockFetch.mockResolvedValue(
                headResponse('https://myaccount.ceros.site/flex-experience/page-2/manifest.v1.json')
            )

            expect(await resolveVanityToCanonical('https://look.example.com')).toBe(CANONICAL)
        })

        // Asserted against a bare domain so nothing falls through to the manifest fallback.
        it.each([
            ['a host outside ceros.site', 'https://evil.example.com/x/manifest.v1.json'],
            [
                'a registrable lookalike anyone can buy',
                'https://myaccount.evil-ceros.site/flex-experience/manifest.v1.json',
            ],
            [
                'a deeper subdomain than an account',
                'https://a.myaccount.ceros.site/flex-experience/manifest.v1.json',
            ],
            ['http, not https', 'http://myaccount.ceros.site/flex-experience/manifest.v1.json'],
            [
                'a filename that is not the manifest',
                'https://myaccount.ceros.site/flex-experience/index.json',
            ],
            ['no experience segment', 'https://myaccount.ceros.site/manifest.v1.json'],
            ['more segments than a page-scoped manifest', 'https://myaccount.ceros.site/a/b/c/manifest.v1.json'],
            ['an account label that fails slug validation', 'https://-nope.ceros.site/flex-experience/manifest.v1.json'],
            ['an experience segment that fails slug validation', 'https://myaccount.ceros.site/-nope/manifest.v1.json'],
            ['a value that is not a URL', 'not-a-url'],
        ])('is ignored when it names %s', async (_label, header) => {
            mockFetch.mockResolvedValue(headResponse(header))

            expect(await resolveVanityToCanonical('https://look.example.com')).toBeNull()
        })
    })

    describe('the manifest fallback', () => {
        // A shared budget would abort the fallback 1s in: 9s + 2s is past the 10s limit.
        it('gives the fallback its own time budget after a slow page check', async () => {
            vi.useFakeTimers()
            try {
                const { response } = okResponse([manifestHead(EXPERIENCE)])
                const after = <T,>(ms: number, value: T, signal?: AbortSignal) =>
                    new Promise<T>((resolve, reject) =>
                        setTimeout(
                            () => (signal?.aborted ? reject(new DOMException('', 'AbortError')) : resolve(value)),
                            ms,
                        ),
                    )
                mockFetch
                    .mockImplementationOnce(() => after(9_000, headResponse(null)))
                    .mockImplementationOnce((_url: string, init: RequestInit) =>
                        after(2_000, response, init.signal ?? undefined),
                    )

                const result = resolveVanityToCanonical('https://look.example.com/flex-experience')
                await vi.advanceTimersByTimeAsync(11_000)

                expect(await result).toBe(CANONICAL)
            } finally {
                vi.useRealTimers()
            }
        })

        it('carries a path-bearing URL when the header cannot be read', async () => {
            const { response } = okResponse([manifestHead(EXPERIENCE)])
            mockFetch.mockRejectedValueOnce(unreadablePage()).mockResolvedValue(response)

            expect(await resolveVanityToCanonical('https://look.example.com/flex-experience')).toBe(
                CANONICAL
            )
            expect(mockFetch).toHaveBeenCalledTimes(2)
        })

        it('returns the canonical experience URL built from the manifest identifiers', async () => {
            const { response } = okResponse([manifestHead(EXPERIENCE)])
            mockFallback(response)

            expect(await resolveVanityToCanonical('https://look.example.com/flex-experience')).toBe(
                CANONICAL
            )
        })

        it('requests the manifest that hangs off the pasted path', async () => {
            const { response } = okResponse([manifestHead(EXPERIENCE)])
            mockFallback(response)

            await resolveVanityToCanonical('https://look.example.com/flex-experience')

            expect(mockFetch).toHaveBeenCalledWith(
                'https://look.example.com/flex-experience/manifest.v1.json',
                expect.objectContaining({ headers: { Accept: 'application/json' } })
            )
        })

        it('keeps a page-scoped pasted path when fetching the manifest', async () => {
            const { response } = okResponse([manifestHead(EXPERIENCE)])
            mockFallback(response)

            await resolveVanityToCanonical('https://look.example.com/flex-experience/page-2')

            expect(mockFetch).toHaveBeenCalledWith(
                'https://look.example.com/flex-experience/page-2/manifest.v1.json',
                expect.anything()
            )
        })

        it('resolves to the experience ROOT, never the pasted page', async () => {
            const { response } = okResponse([manifestHead({ ...EXPERIENCE, pageSlug: 'page-2' })])
            mockFallback(response)

            expect(
                await resolveVanityToCanonical('https://look.example.com/flex-experience/page-2')
            ).toBe(CANONICAL)
        })

        it('trims a pasted URL before using it', async () => {
            const { response } = okResponse([manifestHead(EXPERIENCE)])
            mockFallback(response)

            await resolveVanityToCanonical('  https://look.example.com/flex-experience\n')

            expect(mockFetch).toHaveBeenCalledWith(
                'https://look.example.com/flex-experience/manifest.v1.json',
                expect.anything()
            )
        })

        it('reads an experience object split across chunks', async () => {
            const head = manifestHead(EXPERIENCE)
            const { response } = okResponse([head.slice(0, 60), head.slice(60, 130), head.slice(130)])
            mockFallback(response)

            expect(await resolveVanityToCanonical('https://look.example.com/flex-experience')).toBe(
                CANONICAL
            )
        })
    })

    describe('it stops reading as soon as the identifiers are known', () => {
        it('cancels the body instead of draining the remaining megabytes', async () => {
            // A second chunk standing in for the ~1.3 MB of assets that follow.
            const { response, reader } = okResponse([manifestHead(EXPERIENCE), 'x'.repeat(4096)])
            mockFallback(response)

            await resolveVanityToCanonical('https://look.example.com/flex-experience')

            expect(reader.read).toHaveBeenCalledTimes(1)
            expect(reader.cancel).toHaveBeenCalled()
        })

        it('sends no Range header, which this route ignores and its preflight forbids', async () => {
            const { response } = okResponse([manifestHead(EXPERIENCE)])
            mockFallback(response)

            await resolveVanityToCanonical('https://look.example.com/flex-experience')

            const headers = mockFetch.mock.calls[1][1].headers as Record<string, string>
            expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('range')
        })
    })

    describe('untrusted identifiers are rejected, not escaped', () => {
        // accountSlug and slug come from a manifest on a pasted host and are
        // interpolated straight into a URL. Anything that could redirect that URL
        // elsewhere has to be refused outright.
        it.each([
            ['a path separator in slug', { ...EXPERIENCE, slug: 'evil/../../thing' }],
            ['a path separator in accountSlug', { ...EXPERIENCE, accountSlug: 'evil/x' }],
            ['a host swap in accountSlug', { ...EXPERIENCE, accountSlug: 'evil.example.com' }],
            ['a dot in slug', { ...EXPERIENCE, slug: 'thing.json' }],
            ['an empty slug', { ...EXPERIENCE, slug: '' }],
            ['a missing accountSlug', { ...EXPERIENCE, accountSlug: undefined }],
            ['a non-string slug', { ...EXPERIENCE, slug: 42 }],
            ['a leading dash in slug', { ...EXPERIENCE, slug: '-nope' }],
        ])('returns null for %s', async (_label, experience) => {
            const { response } = okResponse([manifestHead(experience)])
            mockFallback(response)

            expect(await resolveVanityToCanonical('https://look.example.com/flex-experience')).toBeNull()
        })
    })

    describe('unreadable responses', () => {
        it('returns null for a non-200 (no manifest there — Studio, or not Ceros)', async () => {
            mockFallback({ ok: false, status: 404, body: null })

            expect(await resolveVanityToCanonical('https://look.example.com/thing')).toBeNull()
        })

        it('returns null when the fetch rejects (a CORS refusal or a dead host)', async () => {
            mockFetch.mockRejectedValue(unreadablePage())

            expect(await resolveVanityToCanonical('https://look.example.com/thing')).toBeNull()
        })

        it('returns null when the body ends before the experience object', async () => {
            const { response } = okResponse(['{"schemaVersion":"1","publishedAt":"x"}'])
            mockFallback(response)

            expect(await resolveVanityToCanonical('https://look.example.com/thing')).toBeNull()
        })

        it('returns null for a body that is not JSON at all', async () => {
            const { response } = okResponse(['<!doctype html><html><title>404</title>'])
            mockFallback(response)

            expect(await resolveVanityToCanonical('https://look.example.com/thing')).toBeNull()
        })

        it('falls back to the whole body where response.body is unavailable', async () => {
            mockFallback({
                ok: true,
                status: 200,
                body: null,
                text: async () => manifestHead(EXPERIENCE),
            })

            expect(await resolveVanityToCanonical('https://look.example.com/flex-experience')).toBe(
                CANONICAL
            )
        })
    })
})

describe('hasExperiencePath', () => {
    it.each([
        ['a vanity URL with an experience', 'https://look.example.com/spring-launch'],
        ['a page-scoped path', 'https://look.example.com/spring-launch/page-2'],
        ['surrounding whitespace', '  https://look.example.com/spring-launch\n'],
    ])('is true for %s', (_label, url) => {
        expect(hasExperiencePath(url)).toBe(true)
    })

    it.each([
        ['a bare domain', 'https://look.example.com'],
        ['a bare domain with a trailing slash', 'https://look.example.com/'],
        ['a bare domain with repeated slashes', 'https://look.example.com///'],
        ['a bare domain with surrounding whitespace', '  https://look.example.com/  \n'],
        ['a non-URL', 'not-a-url'],
        ['an empty string', ''],
    ])('is false for %s', (_label, url) => {
        expect(hasExperiencePath(url)).toBe(false)
    })
})
