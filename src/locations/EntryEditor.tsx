import { EditorAppSDK, EntryAPI } from '@contentful/app-sdk'
import {
    Box,
    Button,
    Flex,
    Form,
    FormControl,
    Note,
    Paragraph,
    TextInput,
} from '@contentful/f36-components'
import { useSDK } from '@contentful/react-apps-toolkit'
import React, { Dispatch, useEffect, useState } from 'react'

import cerosLogo from '../assets/ceros-logo.svg'
import styles from '../styles'
import { parseCerosUrl } from '../oembed'
import { AppInstallationParameters } from './ConfigScreen'
import tokens from '@contentful/f36-tokens'
import { ExperiencePicker, SelectedExperience } from './ExperiencePicker'
import { classifyEmbed, EmbedKind } from '../embed-classify'
import { EmbedPreview } from '../EmbedPreview'
import { callCerosAction, findCerosActionId } from '../ceros-action'
import { ConfirmationModel, EmbedVariant, ExperienceConfirmation } from '../ExperienceConfirmation'

export { classifyEmbed } from '../embed-classify'
export type { EmbedKind } from '../embed-classify'

// Restores a field to a previously-captured value. getValue() returns
// undefined for a field that was never set (e.g. a fresh entry) — setValue()
// is the wrong API for clearing a field in that case (it also leaves an
// unhandled promise), so an absent previous value is restored with
// removeValue() instead.
const restoreField = (
    field: { setValue: (value: unknown) => unknown; removeValue: () => unknown },
    previousValue: unknown
) => {
    if (previousValue === undefined) {
        field.removeValue()
    } else {
        field.setValue(previousValue)
    }
}

interface StateProps {
    entry: EntryAPI
    setLinked: Dispatch<any>
    parameters: AppInstallationParameters
}

function EmptyState({ entry, setLinked, parameters }: StateProps) {
    const sdk = useSDK<EditorAppSDK>()
    const [experienceUrl, setExperienceUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [isCerosExperienceInvalid, setIsCerosExperienceInvalid] = useState(false)
    const [isChooserOpen, setIsChooserOpen] = useState(false)
    const [saveError, setSaveError] = useState(false)
    const [confirming, setConfirming] = useState<ConfirmationModel | null>(null)
    const [resolveError, setResolveError] = useState<string | null>(null)

    // Commits a chosen experience + embed code to the entry. Shared by the
    // picker and the paste flow so both save identically.
    const commit = (name: string, url: string, embedCode: string) => {
        setLoading(true)

        // Capture the persisted values before writing the draft, so a failed
        // save can roll the in-memory fields back instead of leaving the
        // editor holding values that were never actually stored.
        const previousTitle = entry.fields[parameters.titleFieldId].getValue()
        const previousUrl = entry.fields[parameters.urlFieldId].getValue()
        const previousEmbedCode = entry.fields[parameters.embedCodeFieldId].getValue()

        entry.fields[parameters.titleFieldId].setValue(name)
        entry.fields[parameters.urlFieldId].setValue(url)
        entry.fields[parameters.embedCodeFieldId].setValue(embedCode)

        setSaveError(false)
        entry.save()
            .then(() => {
                setLoading(false)
                setLinked(true)
            })
            .catch((err) => {
                console.error('Failed to save entry:', err)
                // Flip the UI state first: if a rollback call below ever threw,
                // the note would otherwise be dropped and the button would be
                // stuck on its loading label — the exact failure mode the
                // rollback itself was added to eliminate.
                setSaveError(true)
                setLoading(false)
                restoreField(entry.fields[parameters.titleFieldId], previousTitle)
                restoreField(entry.fields[parameters.urlFieldId], previousUrl)
                restoreField(entry.fields[parameters.embedCodeFieldId], previousEmbedCode)
            })
    }

    const linkByUrl = async (url: string) => {
        setIsCerosExperienceInvalid(false)
        setResolveError(null)
        setSaveError(false)

        // Keep the existing host allowlist as a cheap pre-filter. It no longer
        // decides Flex vs Studio — the function's HEAD does that — it only keeps
        // obviously non-Ceros URLs from reaching the function.
        if (!parseCerosUrl(url)) {
            setIsCerosExperienceInvalid(true)
            return
        }

        setLoading(true)
        try {
            const actionId = await findCerosActionId(sdk)
            const res = await callCerosAction(sdk, actionId, { action: 'resolveExperience', url })
            if (res.error) throw new Error(String(res.error))

            const d = res.data as ConfirmationModel
            if (!d || !d.embedCodes || Object.keys(d.embedCodes).length === 0) {
                throw new Error('No embed code could be generated for this experience.')
            }
            setConfirming(d)
        } catch (err) {
            console.error('Failed to resolve experience:', err)
            setResolveError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    const handleSelectExperience = ({ name, url, embedCode }: SelectedExperience) => {
        setIsChooserOpen(false)
        commit(name, url, embedCode)
    }

    return (
        <>
            {saveError && (
                <Box marginBottom="spacingM">
                    <Note variant="negative">
                        Couldn't save this entry. Please try again. If the problem persists, refresh Contentful and retry.
                    </Note>
                </Box>
            )}
            {confirming ? (
                <>
                    <img src={cerosLogo} alt="Ceros Logo" className={styles.logo} width="150px" />
                    <ExperienceConfirmation
                        model={confirming}
                        onInsert={(embedCode) => commit(confirming.name, confirming.url, embedCode)}
                        onBack={() => setConfirming(null)}
                        isBusy={loading}
                    />
                </>
            ) : (
                <>
                    <ExperiencePicker
                        isShown={isChooserOpen}
                        onClose={() => setIsChooserOpen(false)}
                        onSelect={handleSelectExperience}
                    />

                    {resolveError && (
                        <Box marginBottom="spacingM">
                            <Note variant="negative">{resolveError}</Note>
                        </Box>
                    )}

                    <img src={cerosLogo} alt="Ceros Logo" className={styles.logo} width="150px" />

                    <Paragraph>
                        Enter the link to your published Ceros experience below, or browse your experiences using the Ceros
                        API.
                    </Paragraph>

                    <Form onSubmit={() => linkByUrl(experienceUrl)}>
                        <FormControl isInvalid={isCerosExperienceInvalid}>
                            <FormControl.Label isRequired>Ceros Experience URL</FormControl.Label>
                            <TextInput
                                value={experienceUrl}
                                type="text"
                                name="experienceUrl"
                                placeholder="https://account.ceros.site/experience"
                                onChange={(e) => setExperienceUrl(e.target.value)}
                            />
                            {isCerosExperienceInvalid && (
                                <FormControl.ValidationMessage>
                                    The experience URL is invalid. Make sure it looks like
                                    'https://account.ceros.site/experience' or 'https://view.ceros.com/account/experience' and that the experience is published.
                                </FormControl.ValidationMessage>
                            )}
                        </FormControl>

                        <Flex gap="spacingM">
                            <Button variant="positive" type="submit" isDisabled={loading} isLoading={loading}>
                                {loading ? 'Linking Experience' : 'Link Experience'}
                            </Button>
                            <Button
                                variant="secondary"
                                isDisabled={loading}
                                onClick={(e: React.MouseEvent) => {
                                    e.preventDefault()
                                    setIsChooserOpen(true)
                                }}
                            >
                                Browse Experiences
                            </Button>
                        </Flex>
                    </Form>
                </>
            )}
        </>
    )
}

function LinkedState({ entry, setLinked, parameters }: StateProps) {
    const sdk = useSDK<EditorAppSDK>()

    // State for unlinking experience
    const [unlinkLoading, setUnlinkLoading] = useState(false)

    // Unlinks the experience from the entry
    const unlinkExperience = async () => {
        setUnlinkLoading(true)
        setLinked(false)

        for (const field of Object.values(entry.fields)) {
            field.removeValue()
        }

        entry.save().then(() => {
            setUnlinkLoading(false)
        })
    }

    // State for refreshing embed code
    const [refreshLoading, setRefreshLoading] = useState(false)
    // Set by a failure to RESOLVE the experience — refreshEmbedCode's or
    // openStyleChooser's call to resolveLinked, or refreshEmbedCode finding no
    // matching variant. The message is specifically about the experience being
    // unreachable/unpublished, so it must never fire for a save problem.
    const [isRefreshError, setIsRefreshError] = useState(false)
    // Set by a failed entry.save() — from refreshEmbedCode's write or
    // applyStyle's write. Kept separate from isRefreshError so a save or
    // version-conflict failure never shows advice ("unlink and relink") that's
    // meant for an unresolvable experience — see EmptyState's
    // saveError/resolveError split, which this mirrors.
    const [isSaveError, setIsSaveError] = useState(false)

    // State for the embed code
    const [embedCode, setEmbedCode] = useState(entry.fields[parameters.embedCodeFieldId].getValue())
    const [embedKind, setEmbedKind] = useState<EmbedKind>('none')
    useEffect(() => {
        setEmbedKind(classifyEmbed(embedCode))
    }, [embedCode])

    const [confirming, setConfirming] = useState<ConfirmationModel | null>(null)
    const [styleLoading, setStyleLoading] = useState(false)
    const [applyingStyle, setApplyingStyle] = useState(false)

    // Resolves the linked experience's currently-available variants. Shared by
    // refresh and "Change embed style" so both see the same set.
    const resolveLinked = async (): Promise<ConfirmationModel> => {
        const experienceUrl = entry.fields[parameters.urlFieldId].getValue()
        const actionId = await findCerosActionId(sdk)
        const res = await callCerosAction(sdk, actionId, { action: 'resolveExperience', url: experienceUrl })
        if (res.error) throw new Error(String(res.error))
        const model = res.data as ConfirmationModel
        if (!model?.embedCodes) throw new Error('No embed code could be generated for this experience.')
        return model
    }

    // Identifies which variant is currently stored by matching the exact saved
    // embed code against the model's available variants, rather than parsing
    // markup — classifyEmbed only distinguishes inline/iframe/none, which isn't
    // enough to tell scrollable from full-height.
    //
    // Without an exact match, the fallback is restricted to variants of the
    // SAME embedKind the entry is actually stored as: an inline entry may only
    // fall back to 'inline', and an iframe entry (full-height or scrollable)
    // may only fall back to 'fullHeight' or 'scrollable' — never across the
    // iframe/inline boundary. A cross-kind fallback would let a designed,
    // transient resolveExperience response (`inlineUnavailable: true`, only an
    // iframe key present — see functions/ceros-api.ts) silently rewrite an
    // author's deliberate inline choice as an iframe snippet and report
    // success, which is the exact silent-clobber this branch exists to
    // eliminate. If nothing of the stored kind is available, the returned
    // variant key is deliberately absent from the model so the caller's
    // `model.embedCodes[currentVariant(model)]` resolves to undefined and its
    // `if (!next) throw` fires — surfacing an error instead of a silent
    // cross-kind rewrite.
    const currentVariant = (model: ConfirmationModel): EmbedVariant => {
        const match = (Object.entries(model.embedCodes) as [EmbedVariant, string | undefined][]).find(
            ([, code]) => code === embedCode
        )
        if (match) return match[0]

        if (embedKind === 'inline') return 'inline'

        // Prefer fullHeight when both iframe variants are offered (matches the
        // pre-existing preference elsewhere), but fall back to scrollable when
        // the model only offers that — e.g. a scrollable-only Studio
        // experience, which must keep resolving correctly.
        return (['fullHeight', 'scrollable'] as const).find((v) => model.embedCodes[v]) ?? 'fullHeight'
    }

    // Refresh rewrites the embed code in the SAME variant it was stored in.
    // classifyEmbed alone can't tell scrollable from full-height, so this uses
    // currentVariant — the same lookup "Change embed style" uses to preselect
    // — rather than guessing fullHeight ?? scrollable, which used to silently
    // convert a deliberately-chosen Scrollable entry to full-height.
    const refreshEmbedCode = async () => {
        setRefreshLoading(true)
        setIsRefreshError(false)
        setIsSaveError(false)
        // Distinguishes a save failure (routed to isSaveError below) from every
        // other failure in this function (routed to isRefreshError), without
        // losing that distinction if the rollback setValue itself throws.
        let saveFailed = false
        try {
            const model = await resolveLinked()
            const next = model.embedCodes[currentVariant(model)]
            if (!next) throw new Error('No matching embed code was returned for this experience.')

            // Capture the persisted value before writing the draft, so a failed
            // save can roll the in-memory field back instead of leaving the
            // editor showing a value that was never actually stored.
            const previous = embedCode
            entry.fields[parameters.embedCodeFieldId].setValue(next)
            try {
                await entry.save()
            } catch (saveErr) {
                saveFailed = true
                entry.fields[parameters.embedCodeFieldId].setValue(previous)
                throw saveErr
            }
            setEmbedCode(next)
        } catch (err) {
            // Leave the stored value untouched on every failure path.
            console.error('Failed to refresh embed code:', err)
            if (saveFailed) {
                // A version conflict or transient save failure — not a sign the
                // experience is unpublished, so never suggest unlinking here.
                setIsSaveError(true)
            } else {
                setIsRefreshError(true)
            }
        } finally {
            setRefreshLoading(false)
        }
    }

    const openStyleChooser = async () => {
        setStyleLoading(true)
        setIsRefreshError(false)
        setIsSaveError(false)
        try {
            setConfirming(await resolveLinked())
        } catch (err) {
            console.error('Failed to resolve experience:', err)
            setIsRefreshError(true)
        } finally {
            setStyleLoading(false)
        }
    }

    const applyStyle = async (nextEmbedCode: string) => {
        setApplyingStyle(true)
        // Clear both error states, not just this call's own: a prior failed
        // Refresh could otherwise leave "unlink and relink" on screen above a
        // style change that just succeeded.
        setIsRefreshError(false)
        setIsSaveError(false)
        const previous = embedCode
        entry.fields[parameters.embedCodeFieldId].setValue(nextEmbedCode)
        try {
            try {
                await entry.save()
            } catch (saveErr) {
                entry.fields[parameters.embedCodeFieldId].setValue(previous)
                throw saveErr
            }
            setEmbedCode(nextEmbedCode)
            setConfirming(null)
        } catch (err) {
            // A save failure here is a save/version-conflict problem, not a
            // sign the experience is unpublished — keep it out of isRefreshError
            // so the unlink/relink advice never shows for it.
            console.error('Failed to save embed style:', err)
            setIsSaveError(true)
        } finally {
            setApplyingStyle(false)
        }
    }

    return (
        <>
            {isRefreshError && (
                <Box marginBottom="spacingXl">
                    <Note variant="negative">
                        There was an error refreshing the embed code. Make sure the experience is still published. If
                        you still have trouble, try unlinking and relinking the experience.
                    </Note>
                </Box>
            )}

            {isSaveError && (
                <Box marginBottom="spacingXl">
                    <Note variant="negative">
                        Couldn't save this entry. Please try again. If the problem persists, refresh Contentful and
                        retry.
                    </Note>
                </Box>
            )}

            <img src={cerosLogo} alt="Ceros Logo" className={styles.logo} width="150px" />

            {embedKind !== 'none' ? (
                <>
                    <Paragraph>
                        A Ceros experience is linked to this entry. You can see a preview of it below.
                    </Paragraph>

                    <Paragraph>
                        If you recently changed the canvas size of the experience or added a tablet or mobile variant,
                        click "Refresh Embed Code" to pull the latest changes.
                    </Paragraph>

                    <Flex>
                        <Box marginRight="spacingM">
                            <Form onSubmit={unlinkExperience}>
                                <Button
                                    variant="negative"
                                    type="submit"
                                    isDisabled={unlinkLoading || refreshLoading}
                                    isLoading={unlinkLoading}
                                >
                                    {unlinkLoading ? 'Unlinking Experience...' : 'Unlink Experience'}
                                </Button>
                            </Form>
                        </Box>
                        <Box marginRight="spacingM">
                            <Form onSubmit={refreshEmbedCode}>
                                <Button
                                    variant="secondary"
                                    type="submit"
                                    isDisabled={unlinkLoading || refreshLoading}
                                    isLoading={refreshLoading}
                                >
                                    {refreshLoading ? 'Refreshing Embed Code...' : 'Refresh Embed Code'}
                                </Button>
                            </Form>
                        </Box>
                        <Box marginRight="spacingM">
                            <Button
                                variant="secondary"
                                isDisabled={unlinkLoading || refreshLoading || styleLoading}
                                isLoading={styleLoading}
                                onClick={openStyleChooser}
                            >
                                Change embed style
                            </Button>
                        </Box>
                    </Flex>

                    {confirming ? (
                        <ExperienceConfirmation
                            model={confirming}
                            initialVariant={currentVariant(confirming)}
                            onInsert={(nextEmbedCode) => applyStyle(nextEmbedCode)}
                            onBack={() => setConfirming(null)}
                            insertLabel="Use this style"
                            isBusy={applyingStyle}
                        />
                    ) : (
                        <EmbedPreview embedCode={embedCode} />
                    )}
                </>
            ) : (
                <>
                    <Paragraph>The embed code in this entry doesn't look like a Ceros experience:</Paragraph>

                    <Box marginTop="spacingL" marginBottom="spacingL" style={{ backgroundColor: tokens.gray200 }}>
                        <code>{embedCode}</code>
                    </Box>

                    <Paragraph>
                        If want to link a Ceros experience to this entry, click "Reset Entry" and then enter your
                        published experience URL.
                    </Paragraph>

                    <Form onSubmit={unlinkExperience}>
                        <Button
                            variant="negative"
                            type="submit"
                            isDisabled={unlinkLoading || refreshLoading}
                            isLoading={unlinkLoading}
                        >
                            {unlinkLoading ? 'Resetting entry...' : 'Reset Entry'}
                        </Button>
                    </Form>
                </>
            )}
        </>
    )
}

const Entry = () => {
    // Access to the SDK provided by the @contentful/react-apps-toolkit
    const sdk = useSDK<EditorAppSDK>()

    // Fetch current app installation parameters
    const [parameters, setParameters] = useState<AppInstallationParameters>({
        contentTypeId: '',
        titleFieldId: '',
        urlFieldId: '',
        embedCodeFieldId: '',
    })
    useEffect(() => {
        ;(async () => {
            console.debug('Loading current app installation parameters...')
            setParameters(sdk.parameters.installation as AppInstallationParameters)
        })()
    }, [sdk.parameters.installation])

    // Set linked state
    const [linked, setLinked] = useState(false)
    useEffect(() => {
        ;(async () => {
            setLinked(
                Boolean(
                    sdk.entry.fields[parameters.titleFieldId]?.getValue() &&
                        sdk.entry.fields[parameters.embedCodeFieldId]?.getValue()
                )
            )
        })()
    }, [sdk.entry, parameters.titleFieldId, parameters.urlFieldId, parameters.embedCodeFieldId])

    return (
        <div className={styles.body}>
            {[parameters.contentTypeId, parameters.titleFieldId, parameters.urlFieldId, parameters.embedCodeFieldId].some((v) => !v) ? (
                <Note variant="negative">
                    The Ceros app isn't fully configured. Please go to the Ceros app configuration screen to configure
                    it.
                </Note>
            ) : sdk.entry.getSys().contentType.sys.id !== parameters.contentTypeId ? (
                <Note variant="negative">
                    The content type of this entry isn't configured to use the Ceros app. Please go to the Ceros app
                    configuration screen to configure it.
                </Note>
            ) : linked ? (
                <LinkedState key={linked.toString()} entry={sdk.entry} setLinked={setLinked} parameters={parameters} />
            ) : (
                <EmptyState key={linked.toString()} entry={sdk.entry} setLinked={setLinked} parameters={parameters} />
            )}
        </div>
    )
}

export default Entry
