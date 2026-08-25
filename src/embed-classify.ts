export type EmbedKind = 'none' | 'iframe' | 'inline'

// Classify a stored embed code so the editor can render it correctly and so a
// refresh can rewrite it in the same format it was stored in.
// - inline: the no-iframe variant, which needs its flex-client script to execute
// - iframe: the full-height / scrollable variants (self-contained iframe markup)
// - none:   not a recognizable Ceros embed
//
// `data-flex-inline` is an unambiguous literal in the inline snippet, which is
// why the embed mode can be inferred rather than stored alongside the code.
// Matching it loosely (e.g. any data-flex-* attribute) would also match
// data-flex-manifest-url and misclassify future attributes.
export function classifyEmbed(embedCode: string): EmbedKind {
    if (!embedCode) return 'none'

    const isInline =
        /\bdata-flex-inline\b/i.test(embedCode) ||
        /<script[^>]+src=["'][^"']*flex-client[^"']*["']/i.test(embedCode)
    if (isInline) return 'inline'

    const isIframe =
        (embedCode.includes('class="ceros-experience"') && embedCode.includes('https://view.ceros.com/')) ||
        embedCode.includes('.ceros.site/')
    if (isIframe) return 'iframe'

    return 'none'
}
