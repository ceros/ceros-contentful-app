import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('@contentful/react-apps-toolkit', () => ({
    useSDK: vi.fn(),
}))

vi.mock('../oembed', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../oembed')>()),
    getExperienceMetadata: vi.fn(),
}))

vi.mock('../ceros-action', () => ({
    findCerosActionId: vi.fn(),
    callCerosAction: vi.fn(),
}))

import { useSDK } from '@contentful/react-apps-toolkit'
import { callCerosAction, findCerosActionId } from '../ceros-action'
import { getExperienceMetadata } from '../oembed'
import Entry from './EntryEditor'

const mockUseSDK = vi.mocked(useSDK)
const mockGetExperienceMetadata = vi.mocked(getExperienceMetadata)
const mockFindCerosActionId = vi.mocked(findCerosActionId)
const mockCallCerosAction = vi.mocked(callCerosAction)

const baseParameters = {
    contentTypeId: 'cerosExperience',
    titleFieldId: 'title',
    urlFieldId: 'url',
    embedCodeFieldId: 'embedCode',
}

const CEROS_EMBED_CODE =
    '<div class="ceros-experience" style="aspect-ratio:4/3">https://view.ceros.com/account/experience</div>'

const makeMockSdk = (overrides: Record<string, any> = {}) => ({
    parameters: {
        installation: baseParameters,
        ...overrides.parameters,
    },
    entry: {
        fields: {
            title: { getValue: vi.fn().mockReturnValue(''), setValue: vi.fn(), removeValue: vi.fn() },
            url: { getValue: vi.fn().mockReturnValue(''), setValue: vi.fn(), removeValue: vi.fn() },
            embedCode: { getValue: vi.fn().mockReturnValue(''), setValue: vi.fn(), removeValue: vi.fn() },
        },
        save: vi.fn().mockResolvedValue({}),
        getSys: vi.fn().mockReturnValue({ contentType: { sys: { id: 'cerosExperience' } } }),
        ...overrides.entry,
    },
    ...overrides,
})

const makeLinkedSdk = (embedCode: string, title = 'My Experience') => {
    const sdk = makeMockSdk()
    sdk.entry.fields.title.getValue.mockReturnValue(title)
    sdk.entry.fields.embedCode.getValue.mockReturnValue(embedCode)
    return sdk
}

describe('Entry — configuration errors', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows a config error when installation parameters are missing', async () => {
        mockUseSDK.mockReturnValue({
            parameters: {
                installation: { contentTypeId: '', titleFieldId: '', urlFieldId: '', embedCodeFieldId: '' },
            },
            entry: {
                fields: {},
                save: vi.fn(),
                getSys: vi.fn().mockReturnValue({ contentType: { sys: { id: '' } } }),
            },
        } as any)

        render(<Entry />)

        expect(screen.getByText(/isn't fully configured/i)).toBeInTheDocument()
    })

    it('shows a content type error when the entry content type does not match', async () => {
        mockUseSDK.mockReturnValue(
            makeMockSdk({
                entry: {
                    fields: {
                        title: { getValue: vi.fn().mockReturnValue('') },
                        url: { getValue: vi.fn().mockReturnValue('') },
                        embedCode: { getValue: vi.fn().mockReturnValue('') },
                    },
                    save: vi.fn(),
                    getSys: vi.fn().mockReturnValue({ contentType: { sys: { id: 'somethingElse' } } }),
                },
            }) as any
        )

        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText(/isn't configured to use the Ceros app/i)).toBeInTheDocument()
        })
    })
})

describe('Entry — EmptyState (no linked experience)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUseSDK.mockReturnValue(makeMockSdk() as any)
    })

    it('renders the URL input form', async () => {
        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/https:\/\/account\.ceros\.site\//i)).toBeInTheDocument()
        })
    })

    it('renders the Link Experience button', async () => {
        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText('Link Experience')).toBeInTheDocument()
        })
    })

    it('shows a validation error when the pasted URL is not a recognized Ceros host', async () => {
        render(<Entry />)

        const input = await screen.findByPlaceholderText(/https:\/\/account\.ceros\.site\//i)
        fireEvent.change(input, { target: { value: 'https://invalid.url' } })
        fireEvent.submit(input.closest('form')!)

        await waitFor(() => {
            expect(screen.getByText(/The experience URL is invalid/i)).toBeInTheDocument()
        })
    })
})

describe('Entry — EmptyState paste flow', () => {
    let sdk: ReturnType<typeof makeMockSdk>

    const FLEX_MODEL = {
        isFlex: true,
        name: 'Fifth Brass Storm',
        url: 'https://myaccount.ceros.site/flex-experience',
        embedCodes: {
            fullHeight: '<iframe src="https://myaccount.ceros.site/flex-experience"></iframe>',
            inline: '<div data-flex-inline></div>',
        },
    }

    beforeEach(() => {
        vi.clearAllMocks()
        sdk = makeMockSdk()
        mockUseSDK.mockReturnValue(sdk as any)
        mockFindCerosActionId.mockResolvedValue('action-1')
    })

    const pasteAndSubmit = async (url: string) => {
        render(<Entry />)
        const input = await screen.findByPlaceholderText(/https:\/\/account\.ceros\.site\//i)
        fireEvent.change(input, { target: { value: url } })
        fireEvent.submit(input.closest('form')!)
    }

    it('resolves a pasted URL through the function and shows the confirmation screen', async () => {
        mockCallCerosAction.mockResolvedValue({ data: FLEX_MODEL })

        await pasteAndSubmit('https://myaccount.ceros.site/flex-experience')

        await waitFor(() => expect(screen.getByText('Fifth Brass Storm')).toBeInTheDocument())
        expect(mockCallCerosAction).toHaveBeenCalledWith(expect.anything(), 'action-1', {
            action: 'resolveExperience',
            url: 'https://myaccount.ceros.site/flex-experience',
        })
        // Both variants offered → a radio group, not confirm-only.
        expect(screen.getAllByRole('radio')).toHaveLength(2)
    })

    it('renders confirm-only for a Studio paste and does not save until confirmed', async () => {
        mockCallCerosAction.mockResolvedValue({
            data: {
                isFlex: false,
                name: 'Untitled 85',
                url: 'https://view.ceros.com/myaccount/studio-experience',
                embedCodes: { fullHeight: '<div class="ceros-experience"></div>' },
            },
        })

        await pasteAndSubmit('https://view.ceros.com/myaccount/studio-experience/p/1')

        await waitFor(() => expect(screen.getByText('Untitled 85')).toBeInTheDocument())
        expect(screen.queryAllByRole('radio')).toHaveLength(0)
        expect(sdk.entry.save).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: /^insert$/i }))

        await waitFor(() => expect(sdk.entry.save).toHaveBeenCalled())
        expect(sdk.entry.fields.embedCode.setValue).toHaveBeenCalledWith('<div class="ceros-experience"></div>')
        expect(sdk.entry.fields.url.setValue).toHaveBeenCalledWith('https://view.ceros.com/myaccount/studio-experience')
    })

    it('saves the inline snippet when the author picks the inline variant', async () => {
        mockCallCerosAction.mockResolvedValue({ data: FLEX_MODEL })

        await pasteAndSubmit('https://myaccount.ceros.site/flex-experience')
        await waitFor(() => expect(screen.getByText('Fifth Brass Storm')).toBeInTheDocument())

        fireEvent.click(screen.getByLabelText(/embed script/i))
        fireEvent.click(screen.getByRole('button', { name: /^insert$/i }))

        await waitFor(() =>
            expect(sdk.entry.fields.embedCode.setValue).toHaveBeenCalledWith('<div data-flex-inline></div>')
        )
    })

    it('shows the function error and does not touch the entry when resolution fails', async () => {
        mockCallCerosAction.mockResolvedValue({ error: 'The experience URL is invalid.' })

        await pasteAndSubmit('https://myaccount.ceros.site/flex-experience')

        await waitFor(() => expect(screen.getByText(/experience URL is invalid/i)).toBeInTheDocument())
        expect(sdk.entry.save).not.toHaveBeenCalled()
        expect(sdk.entry.fields.embedCode.setValue).not.toHaveBeenCalled()
    })

    it('clears a stale save error when a fresh URL resolves', async () => {
        const SECOND_MODEL = {
            isFlex: true,
            name: 'Second Brass Storm',
            url: 'https://myaccount.ceros.site/other-flex-experience',
            embedCodes: {
                fullHeight: '<iframe src="https://myaccount.ceros.site/other-flex-experience"></iframe>',
            },
        }
        mockCallCerosAction
            .mockResolvedValueOnce({ data: FLEX_MODEL })
            .mockResolvedValueOnce({ data: SECOND_MODEL })
        sdk.entry.save.mockRejectedValueOnce(new Error('save failed'))

        await pasteAndSubmit('https://myaccount.ceros.site/flex-experience')
        await waitFor(() => expect(screen.getByText('Fifth Brass Storm')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /^insert$/i }))

        await waitFor(() => expect(screen.getByText(/couldn't save this entry/i)).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /^back$/i }))

        const input = screen.getByPlaceholderText(/https:\/\/account\.ceros\.site\//i)
        fireEvent.change(input, { target: { value: 'https://myaccount.ceros.site/other-flex-experience' } })
        fireEvent.submit(input.closest('form')!)

        await waitFor(() => expect(screen.getByText('Second Brass Storm')).toBeInTheDocument())
        expect(screen.queryByText(/couldn't save this entry/i)).not.toBeInTheDocument()
    })

    it('restores all three fields and stays unlinked when a paste save fails', async () => {
        mockCallCerosAction.mockResolvedValue({ data: FLEX_MODEL })
        sdk.entry.save.mockRejectedValueOnce(new Error('save failed'))

        await pasteAndSubmit('https://myaccount.ceros.site/flex-experience')
        await waitFor(() => expect(screen.getByText('Fifth Brass Storm')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /^insert$/i }))

        await waitFor(() => expect(screen.getByText(/couldn't save this entry/i)).toBeInTheDocument())

        // All three fields were written with the chosen experience, then rolled
        // back to their prior (empty) values once the save rejected.
        expect(sdk.entry.fields.title.setValue).toHaveBeenCalledWith('Fifth Brass Storm')
        expect(sdk.entry.fields.title.setValue).toHaveBeenLastCalledWith('')
        expect(sdk.entry.fields.url.setValue).toHaveBeenCalledWith('https://myaccount.ceros.site/flex-experience')
        expect(sdk.entry.fields.url.setValue).toHaveBeenLastCalledWith('')
        expect(sdk.entry.fields.embedCode.setValue).toHaveBeenCalledWith(FLEX_MODEL.embedCodes.fullHeight)
        expect(sdk.entry.fields.embedCode.setValue).toHaveBeenLastCalledWith('')

        // Never flipped to the linked view for a write that was never persisted.
        expect(screen.getByText('Fifth Brass Storm')).toBeInTheDocument()
    })

    it('rejects a non-Ceros host before calling the function', async () => {
        await pasteAndSubmit('https://example.com/not-ceros')

        await waitFor(() => expect(screen.getByText(/experience URL is invalid/i)).toBeInTheDocument())
        expect(mockCallCerosAction).not.toHaveBeenCalled()
    })
})

describe('Entry — LinkedState (experience linked)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows the Ceros experience preview for a valid Ceros view.ceros.com embed code', async () => {
        mockUseSDK.mockReturnValue(makeLinkedSdk(CEROS_EMBED_CODE) as any)

        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText(/A Ceros experience is linked/i)).toBeInTheDocument()
        })
    })

    it('shows the Ceros experience preview for a *.ceros.site embed code', async () => {
        const cerosSiteEmbedCode = '<div>https://myaccount.ceros.site/experience</div>'
        mockUseSDK.mockReturnValue(makeLinkedSdk(cerosSiteEmbedCode) as any)

        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText(/A Ceros experience is linked/i)).toBeInTheDocument()
        })
    })

    it('shows a warning for non-Ceros embed code', async () => {
        const nonCerosEmbed = '<iframe src="https://example.com/embed"></iframe>'
        mockUseSDK.mockReturnValue(makeLinkedSdk(nonCerosEmbed) as any)

        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText(/doesn't look like a Ceros experience/i)).toBeInTheDocument()
        })
    })

    it('shows a warning when embed code has ceros-experience class but no view.ceros.com URL', async () => {
        const partialEmbed = '<div class="ceros-experience">https://example.com/something</div>'
        mockUseSDK.mockReturnValue(makeLinkedSdk(partialEmbed) as any)

        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText(/doesn't look like a Ceros experience/i)).toBeInTheDocument()
        })
    })

    it('renders the Refresh Embed Code button for Ceros experiences', async () => {
        mockUseSDK.mockReturnValue(makeLinkedSdk(CEROS_EMBED_CODE) as any)

        render(<Entry />)

        await waitFor(() => {
            expect(screen.getByText('Refresh Embed Code')).toBeInTheDocument()
        })
    })

    it('clears all entry fields when unlinking', async () => {
        const sdk = makeLinkedSdk(CEROS_EMBED_CODE)
        mockUseSDK.mockReturnValue(sdk as any)

        render(<Entry />)

        const unlinkButton = await screen.findByText('Unlink Experience')
        fireEvent.submit(unlinkButton.closest('form')!)

        await waitFor(() => {
            expect(sdk.entry.fields.title.removeValue).toHaveBeenCalled()
            expect(sdk.entry.fields.url.removeValue).toHaveBeenCalled()
            expect(sdk.entry.fields.embedCode.removeValue).toHaveBeenCalled()
        })
    })

    it('shows an error note when refresh fails', async () => {
        const sdk = makeLinkedSdk(CEROS_EMBED_CODE)
        sdk.entry.fields.url.getValue.mockReturnValue('https://view.ceros.com/account/experience')
        mockUseSDK.mockReturnValue(sdk as any)
        mockGetExperienceMetadata.mockResolvedValue(null)

        render(<Entry />)

        const refreshButton = await screen.findByText('Refresh Embed Code')
        fireEvent.submit(refreshButton.closest('form')!)

        await waitFor(() => {
            expect(
                screen.getByText(/There was an error refreshing the embed code/i)
            ).toBeInTheDocument()
        })
    })

    it('updates the embed code field when refresh succeeds', async () => {
        const sdk = makeLinkedSdk(CEROS_EMBED_CODE)
        sdk.entry.fields.url.getValue.mockReturnValue('https://view.ceros.com/account/experience')
        mockUseSDK.mockReturnValue(sdk as any)

        const freshEmbed = '<div class="ceros-experience">https://view.ceros.com/account/experience-updated</div>'
        mockGetExperienceMetadata.mockResolvedValue({
            type: 'rich',
            url: 'https://view.ceros.com/account/experience',
            title: 'My Experience',
            html: freshEmbed,
            width: 800,
            height: 600,
            provider_name: 'Ceros',
            provider_url: 'https://ceros.com',
            version: '1.0',
            embedType: 'full-height',
        })

        render(<Entry />)

        const refreshButton = await screen.findByText('Refresh Embed Code')
        fireEvent.submit(refreshButton.closest('form')!)

        await waitFor(() => {
            expect(sdk.entry.fields.embedCode.setValue).toHaveBeenCalledWith(freshEmbed)
        })
    })
})


describe('Entry — EmptyState trims the pasted URL', () => {
    let sdk: ReturnType<typeof makeMockSdk>

    beforeEach(() => {
        vi.clearAllMocks()
        sdk = makeMockSdk()
        mockUseSDK.mockReturnValue(sdk as any)
        mockFindCerosActionId.mockResolvedValue('action-1')
    })

    const pasteAndSubmit = async (url: string) => {
        render(<Entry />)
        const input = await screen.findByPlaceholderText(/https:\/\/account\.ceros\.site\//i)
        fireEvent.change(input, { target: { value: url } })
        fireEvent.submit(input.closest('form')!)
    }

    it('sends a trimmed URL to the function', async () => {
        mockCallCerosAction.mockResolvedValue({
            data: {
                isFlex: true, name: 'Fifth Brass Storm',
                url: 'https://myaccount.ceros.site/flex-experience',
                embedCodes: { fullHeight: '<iframe></iframe>' },
            },
        })

        await pasteAndSubmit('  https://myaccount.ceros.site/flex-experience\n')

        await waitFor(() => expect(mockCallCerosAction).toHaveBeenCalled())
        expect(mockCallCerosAction).toHaveBeenCalledWith(expect.anything(), 'action-1', {
            action: 'resolveExperience',
            url: 'https://myaccount.ceros.site/flex-experience',
        })
    })

    it('rejects a whitespace-only paste without calling the function', async () => {
        await pasteAndSubmit('   ')

        await waitFor(() => expect(screen.getByText(/experience URL is invalid/i)).toBeInTheDocument())
        expect(mockCallCerosAction).not.toHaveBeenCalled()
    })
})
