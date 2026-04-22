import { extract, setProviderList } from '@extractus/oembed-extractor'

export interface OembedMetadata {
    type: string
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

export async function getExperienceMetadata(experienceUrl: string): Promise<OembedMetadata | null> {
    // Parse URL first so we can build the provider list dynamically
    // Matches view.ceros.com/account/experience or account.ceros.site/experience
    const regex = /(https:\/\/(?:view\.ceros\.com\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+|[a-zA-Z0-9-_]+\.ceros\.site\/[a-zA-Z0-9-_]+))(?:.*)$/
    let result = regex.exec(experienceUrl)

    if (!result) {
        console.trace(`Experience URL '${experienceUrl}' isn't valid. Make sure it looks like
        'https://view.ceros.com/account/experience' or 'https://account.ceros.site/experience'`)
        return null
    }

    const canonicalUrl = result[1]

    // Build the provider list conditionally based on the URL type
    const providers: Parameters<typeof setProviderList>[0] = []

    const cerosSiteMatch = /^https:\/\/([a-zA-Z0-9-_]+)\.ceros\.site\//.exec(experienceUrl)
    if (cerosSiteMatch) {
        const account = cerosSiteMatch[1]
        providers.push({
            provider_name: 'Ceros',
            provider_url: 'https://www.ceros.com/',
            endpoints: [
                {
                    schemes: [`https://${account}.ceros.site/*`],
                    url: `https://${account}.ceros.site/oembed`,
                    discovery: true,
                },
            ],
        })
    } else {
        providers.push({
            provider_name: 'Ceros',
            provider_url: 'https://www.ceros.com/',
            endpoints: [
                {
                    schemes: ['https://view.ceros.com/*'],
                    url: 'https://view.ceros.com/oembed',
                    discovery: true,
                },
            ],
        })
    }

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
