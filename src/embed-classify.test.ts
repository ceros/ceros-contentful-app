import { describe, it, expect } from 'vitest'
import { classifyEmbed } from './embed-classify'

// The live inline snippet, including the data-embed-height attribute that the
// server emits but older local copies of the snippet builder do not.
const INLINE_SNIPPET =
    '<div data-flex-inline data-flex-manifest-url="https://myaccount.ceros.site/flex-experience/manifest.v1.json" data-embed-height="auto"></div>' +
    '<script src="https://assets.ceros.site/js/flex-client.js"></script>'

const STUDIO_IFRAME =
    '<div class="ceros-experience" style="position:relative;width:auto;padding:0 0 56.25%;height:0;">' +
    '<iframe allowfullscreen src="https://view.ceros.com/myaccount/studio-experience" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"></iframe></div>' +
    '<script type="text/javascript" src="https://view.ceros.com/scroll-proxy.min.js" data-ceros-origin-domains="view.ceros.com"></script>'

const FLEX_IFRAME =
    '<iframe src="https://myaccount.ceros.site/flex-experience" width="100%" height="600" frameborder="0"></iframe>'

describe('classifyEmbed', () => {
    it('classifies the live inline snippet as inline', () => {
        expect(classifyEmbed(INLINE_SNIPPET)).toBe('inline')
    })

    it('classifies a snippet with only the flex-client script as inline', () => {
        expect(classifyEmbed('<script src="https://assets.ceros.site/js/flex-client.js"></script>')).toBe('inline')
    })

    it('does NOT classify an unrelated data-flex-* attribute as inline', () => {
        // The old loose pattern (data-flex-[a-z-]+) matched this; the tightened
        // one must not. This is the regression the tightening exists to prevent.
        expect(classifyEmbed('<div data-flex-manifest-url="https://x.ceros.site/y/manifest.v1.json"></div>')).not.toBe('inline')
    })

    it('classifies a Studio iframe embed as iframe', () => {
        expect(classifyEmbed(STUDIO_IFRAME)).toBe('iframe')
    })

    it('classifies a Flex iframe embed as iframe', () => {
        expect(classifyEmbed(FLEX_IFRAME)).toBe('iframe')
    })

    it('classifies empty input as none', () => {
        expect(classifyEmbed('')).toBe('none')
    })

    it('classifies unrelated HTML as none', () => {
        expect(classifyEmbed('<p>Hello world</p>')).toBe('none')
    })
})
