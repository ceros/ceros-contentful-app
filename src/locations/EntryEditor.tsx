import { EditorAppSDK, EntryAPI } from '@contentful/app-sdk'
import {
    Box,
    Button,
    Flex,
    Form,
    FormControl,
    Modal,
    Note,
    Paragraph,
    Spinner,
    TextInput,
} from '@contentful/f36-components'
import { useSDK } from '@contentful/react-apps-toolkit'
import React, { Dispatch, useEffect, useRef, useState } from 'react'

import cerosLogo from '../assets/ceros-logo.svg'
import styles from '../styles'
import { getExperienceMetadata } from '../oembed'
import { AppInstallationParameters } from './ConfigScreen'
import tokens from '@contentful/f36-tokens'

interface FolderNode {
    resourceId: string
    name: string
}

interface ExperienceNode {
    resourceId: string
    name: string
    thumbnailUrl?: string
}

interface SelectedExperience {
    name: string
    url: string
    embedCode: string
}

interface StateProps {
    entry: EntryAPI
    setLinked: Dispatch<any>
    parameters: AppInstallationParameters
}

function ExperienceChooserModal({
    isShown,
    onClose,
    onSelect,
}: {
    isShown: boolean
    onClose: () => void
    onSelect: (experience: SelectedExperience) => void
}) {
    const sdk = useSDK<EditorAppSDK>()
    const [appActionId, setAppActionId] = useState<string | null>(null)
    const [view, setView] = useState<'folders' | 'experiences'>('folders')
    const [folders, setFolders] = useState<FolderNode[]>([])
    const [selectedFolder, setSelectedFolder] = useState<FolderNode | null>(null)
    const [experiences, setExperiences] = useState<ExperienceNode[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const callFunction = async (actionId: string, params: Record<string, unknown>) => {
        const call = await sdk.cma.appActionCall.createWithResult(
            {
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
                appDefinitionId: sdk.ids.app || '',
                appActionId: actionId,
            },
            { parameters: params }
        )

        console.debug('[CerosApi] call result:', call)

        if (call.sys.status === 'failed') {
            const err = (call.sys as any).error
            throw new Error(`Function call failed: ${err?.message ?? JSON.stringify(err)}`)
        }

        return (call.sys as any).result as Record<string, unknown>
    }

    // On open: find the App Action, then load the folder tree.
    useEffect(() => {
        if (!isShown) {
            setView('folders')
            setFolders([])
            setSelectedFolder(null)
            setExperiences([])
            setError(null)
            setAppActionId(null)
            return
        }

        setLoading(true)
        setError(null)

        ;(async () => {
            try {
                const actionsResponse = await sdk.cma.appAction.getMany({
                    organizationId: sdk.ids.organization,
                    appDefinitionId: sdk.ids.app || '',
                })

                const cerosAction = actionsResponse.items.find((a) => a.name === 'CerosApi')
                if (!cerosAction) {
                    setError('The CerosApi App Action is not set up. Run "npm run create-app-action" after deploying.')
                    return
                }

                const actionId = cerosAction.sys.id
                setAppActionId(actionId)

                const data = await callFunction(actionId, { action: 'getFolderTree' })
                if (data.error) throw new Error(String(data.error))

                setFolders((data.folders as FolderNode[]) ?? [])
            } catch (err) {
                console.error('[CerosApi] getFolderTree error:', err)
                setError(err instanceof Error ? err.message : String(err))
            } finally {
                setLoading(false)
            }
        })()
    }, [isShown]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleFolderClick = async (folder: FolderNode) => {
        if (!appActionId) return
        setSelectedFolder(folder)
        setView('experiences')
        setLoading(true)
        setExperiences([])
        setError(null)

        try {
            const data = await callFunction(appActionId, {
                action: 'getFolderExperiences',
                folderId: folder.resourceId,
            })
            if (data.error) throw new Error(String(data.error))
            setExperiences((data.experiences as ExperienceNode[]) ?? [])
        } catch (err) {
            console.error('[CerosApi] getFolderExperiences error:', err)
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    const handleExperienceClick = async (exp: ExperienceNode) => {
        if (!appActionId) return
        setLoading(true)
        setError(null)

        try {
            const data = await callFunction(appActionId, {
                action: 'getEmbedCode',
                resourceId: exp.resourceId,
            })
            if (data.error) throw new Error(String(data.error))
            onSelect({ name: exp.name, url: String(data.url ?? ''), embedCode: String(data.embedCode ?? '') })
        } catch (err) {
            console.error('[CerosApi] getEmbedCode error:', err)
            setError(err instanceof Error ? err.message : String(err))
            setLoading(false)
        }
    }

    const title =
        view === 'experiences' && selectedFolder
            ? `Experiences in "${selectedFolder.name}"`
            : 'Choose a Ceros Experience'

    return (
        <Modal isShown={isShown} onClose={onClose} size="large">
            <Modal.Header title={title} onClose={onClose} />
            <Modal.Content>
                {loading && (
                    <Flex justifyContent="center" alignItems="center" style={{ minHeight: '120px' }}>
                        <Spinner size="large" />
                    </Flex>
                )}

                {!loading && error && <Note variant="negative">{error}</Note>}

                {!loading && !error && view === 'folders' && (
                    <>
                        {folders.length === 0 && <Paragraph>No folders found.</Paragraph>}
                        {folders.length > 0 && (
                            <div>
                                {folders.map((folder) => (
                                    <div
                                        key={folder.resourceId}
                                        className={styles.folderRow}
                                        onClick={() => handleFolderClick(folder)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && handleFolderClick(folder)}
                                    >
                                        {folder.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {!loading && !error && view === 'experiences' && (
                    <>
                        {experiences.length === 0 && (
                            <Paragraph>No published experiences in this folder.</Paragraph>
                        )}
                        {experiences.length > 0 && (
                            <div className={styles.experienceGrid}>
                                {experiences.map((exp) => (
                                    <div
                                        key={exp.resourceId}
                                        className={styles.experienceCard}
                                        onClick={() => handleExperienceClick(exp)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && handleExperienceClick(exp)}
                                    >
                                        {exp.thumbnailUrl ? (
                                            <img
                                                src={exp.thumbnailUrl}
                                                alt={exp.name}
                                                className={styles.experienceThumbnail}
                                            />
                                        ) : (
                                            <div className={styles.experienceThumbnailPlaceholder} />
                                        )}
                                        <div className={styles.experienceCardLabel}>{exp.name}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </Modal.Content>
            <Modal.Controls>
                <>
                    {view === 'experiences' && (
                        <Button
                            variant="secondary"
                            isDisabled={loading}
                            onClick={() => {
                                setView('folders')
                                setSelectedFolder(null)
                                setExperiences([])
                                setError(null)
                            }}
                        >
                            Back to Folders
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                </>
            </Modal.Controls>
        </Modal>
    )
}

function EmptyState({ entry, setLinked, parameters }: StateProps) {
    const [experienceUrl, setExperienceUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [isCerosExperienceInvalid, setIsCerosExperienceInvalid] = useState(false)
    const [isChooserOpen, setIsChooserOpen] = useState(false)

    const linkByUrl = async (url: string) => {
        setLoading(true)
        setIsCerosExperienceInvalid(false)

        const experienceMetadata = await getExperienceMetadata(url)

        if (experienceMetadata) {
            entry.fields[parameters.titleFieldId].setValue(experienceMetadata['title'])
            entry.fields[parameters.urlFieldId].setValue(experienceMetadata['url'])
            entry.fields[parameters.embedCodeFieldId].setValue(experienceMetadata['html'])

            entry.save().then(() => {
                setLoading(false)
                setLinked(true)
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

        entry.save().then(() => {
            setLoading(false)
            setLinked(true)
        })
    }

    return (
        <>
            <ExperienceChooserModal
                isShown={isChooserOpen}
                onClose={() => setIsChooserOpen(false)}
                onSelect={handleSelectExperience}
            />

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
                        placeholder="https://view.ceros.com/account/experience"
                        onChange={(e) => setExperienceUrl(e.target.value)}
                    />
                    {isCerosExperienceInvalid && (
                        <FormControl.ValidationMessage>
                            The experience URL is invalid. Make sure it looks like
                            'https://view.ceros.com/account/experience' and that the experience is published.
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
    const [isCerosExperience, setIsCerosExperience] = useState(false)
    useEffect(() => {
        ;(async () => {
            // Determine if the embed code is for a Ceros experience
            setIsCerosExperience(
                Boolean(
                  (embedCode.includes('class="ceros-experience"') && embedCode.includes('https://view.ceros.com/')) ||
                  embedCode.includes('.ceros.site/')
                )
            )
        })()
    }, [embedCode])

    const embedRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const container = embedRef.current
        if (!container || !embedCode) return
        container.innerHTML = ''
        container.appendChild(document.createRange().createContextualFragment(embedCode))
    }, [embedCode, isCerosExperience])

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

            {isCerosExperience ? (
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

                    <div className={styles.experienceEmbed} ref={embedRef}></div>
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
