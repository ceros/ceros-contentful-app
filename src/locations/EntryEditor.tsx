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
import React, { Dispatch, useEffect, useRef, useState } from 'react'

import cerosLogo from '../assets/ceros-logo.svg'
import styles from '../styles'
import { getExperienceMetadata } from '../oembed'
import { AppInstallationParameters } from './ConfigScreen'
import tokens from '@contentful/f36-tokens'
import { ExperiencePicker, SelectedExperience } from './ExperiencePicker'
import { classifyEmbed, EmbedKind } from '../embed-classify'

export { classifyEmbed } from '../embed-classify'
export type { EmbedKind } from '../embed-classify'

interface StateProps {
    entry: EntryAPI
    setLinked: Dispatch<any>
    parameters: AppInstallationParameters
}

const INLINE_PREVIEW_DEFAULT_HEIGHT = 600

// Renders an inline Flex embed inside a srcDoc iframe so its flex-client
// script executes in an isolated document (it never touches the Contentful
// app's DOM/globals; teardown is just discarding the iframe). The srcDoc
// document is same-origin, so we measure its content to auto-size the preview
// and to detect whether the experience actually rendered.
function InlineEmbedPreview({ embedCode }: { embedCode: string }) {
    const [height, setHeight] = useState(INLINE_PREVIEW_DEFAULT_HEIGHT)
    const [failed, setFailed] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    useEffect(() => {
        setFailed(false)
        let settled = false
        const measure = (): number => {
            const doc = iframeRef.current?.contentDocument
            if (!doc || !doc.body) return 0
            return Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)
        }
        // flex-client renders asynchronously after load, so poll for content
        // growth over a short window rather than measuring a single time.
        const interval = setInterval(() => {
            const h = measure()
            if (h > 40) {
                setHeight(h)
                settled = true
            }
        }, 500)
        const timeout = setTimeout(() => {
            clearInterval(interval)
            if (!settled) setFailed(true)
        }, 6000)
        return () => {
            clearInterval(interval)
            clearTimeout(timeout)
        }
    }, [embedCode])

    return (
        <>
            <iframe
                ref={iframeRef}
                title="Ceros inline experience preview"
                srcDoc={embedCode}
                style={{ width: '100%', height, border: 'none' }}
            />
            <Paragraph>
                <small style={{ color: tokens.gray600 }}>
                    This is an editor preview — the inline experience will size itself correctly on your published site.
                </small>
            </Paragraph>
            {failed && (
                <Box marginTop="spacingS">
                    <Note variant="warning">
                        The inline preview couldn't be shown here, but the experience will still render on your published site.
                    </Note>
                </Box>
            )}
        </>
    )
}

function EmptyState({ entry, setLinked, parameters }: StateProps) {
    const [experienceUrl, setExperienceUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [isCerosExperienceInvalid, setIsCerosExperienceInvalid] = useState(false)
    const [isChooserOpen, setIsChooserOpen] = useState(false)
    const [saveError, setSaveError] = useState(false)

    const linkByUrl = async (url: string) => {
        setLoading(true)
        setIsCerosExperienceInvalid(false)

        const experienceMetadata = await getExperienceMetadata(url)

        if (experienceMetadata) {
            entry.fields[parameters.titleFieldId].setValue(experienceMetadata['title'])
            entry.fields[parameters.urlFieldId].setValue(experienceMetadata['url'])
            entry.fields[parameters.embedCodeFieldId].setValue(experienceMetadata['html'])

            setSaveError(false)
            entry.save()
                .then(() => {
                    setLoading(false)
                    setLinked(true)
                })
                .catch((err) => {
                    console.error('Failed to save entry after linking by URL:', err)
                    setSaveError(true)
                    setLoading(false)
                })
        } else {
            console.error(`Couldn't get experience metadata for url: '${url}'`)
            setIsCerosExperienceInvalid(true)
            setLoading(false)
        }
    }

    const handleSelectExperience = ({ name, url, embedCode }: SelectedExperience) => {
        setIsChooserOpen(false)
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
                console.error('Failed to save entry after selecting experience:', err)
                setSaveError(true)
                setLoading(false)
            })
    }

    return (
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
    )
}

function LinkedState({ entry, setLinked, parameters }: StateProps) {
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

    // Fetches the embed code again and saves it to the entry
    const refreshEmbedCode = async () => {
        setRefreshLoading(true)

        const experienceUrl = entry.fields[parameters.urlFieldId].getValue()
        const experienceMetadata = await getExperienceMetadata(experienceUrl)

        // Check if the metadata was able to be retrieved
        if (experienceMetadata) {
            entry.fields[parameters.embedCodeFieldId].setValue(experienceMetadata['html'])

            entry.save().then(() => {
                setEmbedCode(experienceMetadata['html'])
                setIsRefreshError(false)
                setRefreshLoading(false)
            })
        } else {
            console.error(`Couldn't get experience metadata for url: '${experienceUrl}'`)
            setIsRefreshError(true)
            setRefreshLoading(false)
        }
    }

    // State for the embed code
    const [embedCode, setEmbedCode] = useState(entry.fields[parameters.embedCodeFieldId].getValue())
    const [embedKind, setEmbedKind] = useState<EmbedKind>('none')
    useEffect(() => {
        setEmbedKind(classifyEmbed(embedCode))
    }, [embedCode])

    const embedRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const container = embedRef.current
        if (!container || !embedCode || embedKind !== 'iframe') return
        container.innerHTML = ''
        container.appendChild(document.createRange().createContextualFragment(embedCode))
    }, [embedCode, embedKind])

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
                    </Flex>

                    {embedKind === 'inline'
                        ? <InlineEmbedPreview embedCode={embedCode} />
                        : <div className={styles.experienceEmbed} ref={embedRef}></div>}
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
