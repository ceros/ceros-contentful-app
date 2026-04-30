import { extract, setProviderList } from '@extractus/oembed-extractor'
import type { OembedData } from '@extractus/oembed-extractor'

export interface OembedMetadata extends OembedData {
    url: string
    title: string
    html: string
    width: number
    height: number
    provider_name: 'Ceros'
    provider_url: 'https://ceros.com'
    version: '1.0'
    embedType: 'full-height' | 'scrollable'
}

export function parseCerosUrl(experienceUrl: string): URL | null {
    try {
        const url = new URL(experienceUrl)
        const host = url.hostname
        if (url.protocol === 'https:' && (host === 'view.ceros.com' || host.endsWith('.ceros.site'))) {
            return url
        }
    } catch { /* invalid URL */ }
    return null
}

export async function getExperienceMetadata(experienceUrl: string): Promise<OembedMetadata | null> {
    const url = parseCerosUrl(experienceUrl)

    if (!url) {
        console.trace(`Experience URL '${experienceUrl}' isn't valid. Make sure it looks like
        'https://<account>.ceros.site/experience' or 'https://view.ceros.com/account/experience'`)
        return null
    }

    const canonicalUrl = url.origin + url.pathname
    const providers: Parameters<typeof setProviderList>[0] = [{
        provider_name: 'Ceros',
        provider_url: 'https://www.ceros.com/',
        endpoints: [
            {
                schemes: [`${url.origin}/*`],
                url: `${url.origin}/oembed`,
                discovery: true,
            },
        ],
    }]

    setProviderList(providers)

    // Fetch the oembed data
    try {
        const metadata = await extract(canonicalUrl) as OembedMetadata
        if (!metadata.url) {
          metadata.url = canonicalUrl
        }
        return metadata
    } catch (err) {
        console.trace(err)
        return null
    }
}
