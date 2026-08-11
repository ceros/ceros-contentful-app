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
import { getExperienceMetadata, parseCerosUrl } from '../oembed'
import { AppInstallationParameters } from './ConfigScreen'
import tokens from '@contentful/f36-tokens'
import { ExperiencePicker, SelectedExperience } from './ExperiencePicker'
import { classifyEmbed, EmbedKind } from '../embed-classify'
import { EmbedPreview } from '../EmbedPreview'
import { callCerosAction, findCerosActionId } from '../ceros-action'
import { ConfirmationModel, EmbedVariant, ExperienceConfirmation } from '../ExperienceConfirmation'

export { classifyEmbed } from '../embed-classify'
export type { EmbedKind } from '../embed-classify'

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
                setSaveError(true)
                setLoading(false)
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
            {confirming ? (
                <>
                    {saveError && (
                        <Box marginBottom="spacingM">
                            <Note variant="negative">
                                Couldn't save this entry. Please try again. If the problem persists, refresh Contentful and retry.
                            </Note>
                        </Box>
                    )}
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

                    {saveError && (
                        <Box marginBottom="spacingM">
                            <Note variant="negative">
                                Couldn't save this entry. Please try again. If the problem persists, refresh Contentful and retry.
                            </Note>
                        </Box>
                    )}

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
    const [isRefreshError, setIsRefreshError] = useState(false)

    // State for the embed code
    const [embedCode, setEmbedCode] = useState(entry.fields[parameters.embedCodeFieldId].getValue())
    const [embedKind, setEmbedKind] = useState<EmbedKind>('none')
    useEffect(() => {
        setEmbedKind(classifyEmbed(embedCode))
    }, [embedCode])

    const [confirming, setConfirming] = useState<ConfirmationModel | null>(null)
    const [styleLoading, setStyleLoading] = useState(false)

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

    // Refresh rewrites the embed code in the SAME format it was stored in.
    // Routing everything through one format is what used to silently replace an
    // inline snippet with iframe HTML.
    const refreshEmbedCode = async () => {
        setRefreshLoading(true)
        try {
            const model = await resolveLinked()
            const next =
                embedKind === 'inline' ? model.embedCodes.inline : model.embedCodes.fullHeight ?? model.embedCodes.scrollable
            if (!next) throw new Error('No matching embed code was returned for this experience.')

            // Capture the persisted value before writing the draft, so a failed
            // save can roll the in-memory field back instead of leaving the
            // editor showing a value that was never actually stored.
            const previous = embedCode
            entry.fields[parameters.embedCodeFieldId].setValue(next)
            try {
                await entry.save()
            } catch (saveErr) {
                entry.fields[parameters.embedCodeFieldId].setValue(previous)
                throw saveErr
            }
            setEmbedCode(next)
            setIsRefreshError(false)
        } catch (err) {
            // Leave the stored value untouched on every failure path.
            console.error('Failed to refresh embed code:', err)
            setIsRefreshError(true)
        } finally {
            setRefreshLoading(false)
        }
    }

    const openStyleChooser = async () => {
        setStyleLoading(true)
        setIsRefreshError(false)
        try {
            setConfirming(await resolveLinked())
        } catch (err) {
            console.error('Failed to resolve experience:', err)
            setIsRefreshError(true)
        } finally {
            setStyleLoading(false)
        }
    }

    // Identifies which variant is currently stored by matching the exact saved
    // embed code against the model's available variants, rather than parsing
    // markup — classifyEmbed only distinguishes inline/iframe/none, which isn't
    // enough to tell scrollable from full-height. Falls back to the
    // embedKind-based guess if nothing matches (e.g. the experience was
    // republished upstream since this entry was linked).
    const currentVariant = (model: ConfirmationModel): EmbedVariant => {
        const match = (Object.entries(model.embedCodes) as [EmbedVariant, string | undefined][]).find(
            ([, code]) => code === embedCode
        )
        return match ? match[0] : embedKind === 'inline' ? 'inline' : 'fullHeight'
    }

    const applyStyle = async (nextEmbedCode: string) => {
        const previous = embedCode
        entry.fields[parameters.embedCodeFieldId].setValue(nextEmbedCode)
        try {
            await entry.save()
            setEmbedCode(nextEmbedCode)
            setConfirming(null)
        } catch (err) {
            entry.fields[parameters.embedCodeFieldId].setValue(previous)
            console.error('Failed to save embed style:', err)
            setIsRefreshError(true)
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
