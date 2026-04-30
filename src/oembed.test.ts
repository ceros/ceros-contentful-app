import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@extractus/oembed-extractor', () => ({
    extract: vi.fn(),
    setProviderList: vi.fn(),
}))

import { extract, setProviderList } from '@extractus/oembed-extractor'
import { getExperienceMetadata, parseCerosUrl, OembedMetadata } from './oembed'

const mockExtract = vi.mocked(extract)
const mockSetProviderList = vi.mocked(setProviderList)

const baseMetadata: OembedMetadata = {
    type: 'rich',
    url: 'https://view.ceros.com/account/experience',
    title: 'My Experience',
    html: '<div class="ceros-experience">...</div>',
    width: 800,
    height: 600,
    provider_name: 'Ceros',
    provider_url: 'https://ceros.com',
    version: '1.0',
    embedType: 'full-height',
}

describe('parseCerosUrl', () => {
    it('returns null for a non-parseable string', () => {
        expect(parseCerosUrl('not-a-url')).toBeNull()
    })

    it('returns null for an empty string', () => {
        expect(parseCerosUrl('')).toBeNull()
    })

    it('returns null for a non-Ceros domain', () => {
        expect(parseCerosUrl('https://example.com/account/experience')).toBeNull()
    })

    it('returns null for an http Ceros URL', () => {
        expect(parseCerosUrl('http://view.ceros.com/account/experience')).toBeNull()
    })

    it('returns a URL for a valid view.ceros.com URL', () => {
        const url = parseCerosUrl('https://view.ceros.com/account/experience')
        expect(url).toBeInstanceOf(URL)
        expect(url?.hostname).toBe('view.ceros.com')
    })

    it('returns a URL for a valid *.ceros.site URL', () => {
        const url = parseCerosUrl('https://myaccount.ceros.site/experience')
        expect(url).toBeInstanceOf(URL)
        expect(url?.hostname).toBe('myaccount.ceros.site')
    })

    it('returns a URL that preserves query params and hash for downstream use', () => {
        const url = parseCerosUrl('https://view.ceros.com/account/experience?foo=bar#section')
        expect(url?.search).toBe('?foo=bar')
        expect(url?.hash).toBe('#section')
    })
})

describe('getExperienceMetadata', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockExtract.mockResolvedValue(baseMetadata)
    })

    describe('URL validation', () => {
        it('returns null for non-Ceros URLs', async () => {
            const result = await getExperienceMetadata('https://example.com/page')
            expect(result).toBeNull()
        })

        it('returns null for plain strings', async () => {
            const result = await getExperienceMetadata('not-a-url')
            expect(result).toBeNull()
        })

        it('returns null for http (non-https) Ceros URLs', async () => {
            const result = await getExperienceMetadata('http://view.ceros.com/account/experience')
            expect(result).toBeNull()
        })

        it('returns null for view.ceros.com URLs missing the experience path segment', async () => {
            const result = await getExperienceMetadata('https://view.ceros.com/account')
            expect(result).toBeNull()
        })

        it('returns null for empty string', async () => {
            const result = await getExperienceMetadata('')
            expect(result).toBeNull()
        })

        it('accepts valid view.ceros.com URLs', async () => {
            const result = await getExperienceMetadata('https://view.ceros.com/account/experience')
            expect(result).not.toBeNull()
        })

        it('accepts valid *.ceros.site URLs', async () => {
            mockExtract.mockResolvedValue({ ...baseMetadata, url: 'https://myaccount.ceros.site/experience' })
            const result = await getExperienceMetadata('https://myaccount.ceros.site/experience')
            expect(result).not.toBeNull()
        })

        it('accepts view.ceros.com URLs with underscores in path segments', async () => {
            const result = await getExperienceMetadata('https://view.ceros.com/my_account/my_experience')
            expect(result).not.toBeNull()
        })

        it('accepts view.ceros.com URLs with hyphens in path segments', async () => {
            const result = await getExperienceMetadata('https://view.ceros.com/my-account/my-experience')
            expect(result).not.toBeNull()
        })
    })

    describe('canonical URL extraction', () => {
        it('passes the base URL to extract for a plain view.ceros.com URL', async () => {
            await getExperienceMetadata('https://view.ceros.com/account/experience')
            expect(mockExtract).toHaveBeenCalledWith('https://view.ceros.com/account/experience')
        })

        it('preserves the full path for view.ceros.com URLs', async () => {
            await getExperienceMetadata('https://view.ceros.com/account/experience/page/2')
            expect(mockExtract).toHaveBeenCalledWith('https://view.ceros.com/account/experience/page/2')
        })

        it('strips query strings from view.ceros.com URLs', async () => {
            await getExperienceMetadata('https://view.ceros.com/account/experience?mobile=true&foo=bar')
            expect(mockExtract).toHaveBeenCalledWith('https://view.ceros.com/account/experience')
        })

        it('preserves the full path for *.ceros.site URLs', async () => {
            mockExtract.mockResolvedValue({ ...baseMetadata, url: 'https://myaccount.ceros.site/experience' })
            await getExperienceMetadata('https://myaccount.ceros.site/experience/page/2')
            expect(mockExtract).toHaveBeenCalledWith('https://myaccount.ceros.site/experience/page/2')
        })

        it('strips query strings from *.ceros.site URLs', async () => {
            mockExtract.mockResolvedValue({ ...baseMetadata, url: 'https://myaccount.ceros.site/experience' })
            await getExperienceMetadata('https://myaccount.ceros.site/experience?mobile=true')
            expect(mockExtract).toHaveBeenCalledWith('https://myaccount.ceros.site/experience')
        })
    })

    describe('provider configuration', () => {
        it('configures view.ceros.com as oembed provider for view.ceros.com URLs', async () => {
            await getExperienceMetadata('https://view.ceros.com/account/experience')
            expect(mockSetProviderList).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        provider_name: 'Ceros',
                        endpoints: expect.arrayContaining([
                            expect.objectContaining({
                                schemes: ['https://view.ceros.com/*'],
                                url: 'https://view.ceros.com/oembed',
                            }),
                        ]),
                    }),
                ])
            )
        })

        it('configures the account subdomain as oembed provider for *.ceros.site URLs', async () => {
            mockExtract.mockResolvedValue({ ...baseMetadata, url: 'https://myaccount.ceros.site/experience' })
            await getExperienceMetadata('https://myaccount.ceros.site/experience')
            expect(mockSetProviderList).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        provider_name: 'Ceros',
                        endpoints: expect.arrayContaining([
                            expect.objectContaining({
                                schemes: ['https://myaccount.ceros.site/*'],
                                url: 'https://myaccount.ceros.site/oembed',
                            }),
                        ]),
                    }),
                ])
            )
        })

        it('always calls setProviderList before extract', async () => {
            const callOrder: string[] = []
            mockSetProviderList.mockImplementation(() => { callOrder.push('setProviderList') })
            mockExtract.mockImplementation(async () => { callOrder.push('extract'); return baseMetadata })

            await getExperienceMetadata('https://view.ceros.com/account/experience')

            expect(callOrder).toEqual(['setProviderList', 'extract'])
        })
    })

    describe('metadata extraction', () => {
        it('returns the metadata from extract on success', async () => {
            const result = await getExperienceMetadata('https://view.ceros.com/account/experience')
            expect(result).toEqual(baseMetadata)
        })

        it('returns null when extract throws', async () => {
            mockExtract.mockRejectedValue(new Error('Network error'))
            const result = await getExperienceMetadata('https://view.ceros.com/account/experience')
            expect(result).toBeNull()
        })

        it('fills url from canonical URL when metadata has no url', async () => {
            const { url: _url, ...metadataWithoutUrl } = baseMetadata
            mockExtract.mockResolvedValue(metadataWithoutUrl)
            const result = await getExperienceMetadata('https://view.ceros.com/account/experience/page/2')
            expect(result?.url).toBe('https://view.ceros.com/account/experience/page/2')
        })

        it('preserves the url from metadata when it is already set', async () => {
            mockExtract.mockResolvedValue({ ...baseMetadata, url: 'https://view.ceros.com/account/experience' })
            const result = await getExperienceMetadata('https://view.ceros.com/account/experience')
            expect(result?.url).toBe('https://view.ceros.com/account/experience')
        })

        it('returns null for invalid URL without calling extract', async () => {
            const result = await getExperienceMetadata('https://notceros.com/foo/bar')
            expect(mockExtract).not.toHaveBeenCalled()
            expect(result).toBeNull()
        })
    })
})
