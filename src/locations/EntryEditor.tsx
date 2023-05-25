import { EditorAppSDK, EntryAPI } from '@contentful/app-sdk'
import { Box, Button, Flex, Form, FormControl, Note, Paragraph, TextInput } from '@contentful/f36-components'
import { useSDK } from '@contentful/react-apps-toolkit'
import React, { Dispatch, useState } from 'react'
import cerosLogo from '../assets/ceros-logo.svg'
import styles from '../styles'
import { getExperienceMetadata } from '../util'
import { AppInstallationParameters } from './ConfigScreen'

interface StateProps {
    entry: EntryAPI
    setLinked: Dispatch<any>
    installationParameters: AppInstallationParameters
}

function EmptyState({ entry, setLinked, installationParameters }: StateProps) {
    const [experienceUrl, setExperienceUrl] = useState('')
    const [loading, setLoading] = useState(false)
    const [isCerosExperienceInvalid, setIsCerosExperienceInvalid] = useState(false)

    const linkExperience = async () => {
        // Set form to submitted
        setLoading(true)

        // Get experience metadata
        const experienceMetadata = await getExperienceMetadata(experienceUrl)

        // Check if the metadata was able to be retrieved
        if (experienceMetadata) {
            entry.fields[installationParameters.titleFieldId].setValue(experienceMetadata['title'])
            entry.fields[installationParameters.urlFieldId].setValue(experienceMetadata['url'])
            entry.fields[installationParameters.embedCodeFieldId].setValue(experienceMetadata['html'])

            entry.save().then(() => {
                setLoading(false)
                setLinked(true)
            })
        } else {
            console.error(`Couldn't get experience metadata for url: '${experienceUrl}'`)
            setIsCerosExperienceInvalid(true)
            setLoading(false)
        }
    }

    return (
        <>
            <div className={styles.body}>
                <img src={cerosLogo} alt="Ceros Logo" className={styles.logo} width="150px" />

                <Paragraph>
                    Enter the link to your published Ceros experience below. The experience's name, embed code, etc.
                    will be pulled and saved to Contentful.
                </Paragraph>

                <Form onSubmit={linkExperience}>
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

                    <Button variant="positive" type="submit" isDisabled={loading} isLoading={loading}>
                        {loading ? 'Linking Experience' : 'Link Experience'}
                    </Button>
                </Form>
            </div>
        </>
    )
}

function LinkedState({ entry, setLinked, installationParameters }: StateProps) {
    // State for unlinking experience
    const [unlinkLoading, setUnlinkLoading] = useState(false)

    // State for refreshing embed code
    const [refreshLoading, setRefreshLoading] = useState(false)
    const [isRefreshError, setIsRefreshError] = useState(false)

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

    const refreshEmbedCode = async () => {
        setRefreshLoading(true)

        const experienceUrl = entry.fields[installationParameters.urlFieldId].getValue()
        const experienceMetadata = await getExperienceMetadata(experienceUrl)

        // Check if the metadata was able to be retrieved
        if (experienceMetadata) {
            entry.fields[installationParameters.embedCodeFieldId].setValue(experienceMetadata['html'])

            entry.save().then(() => {
                setIsRefreshError(false)
                setRefreshLoading(false)
            })
        } else {
            console.error(`Couldn't get experience metadata for url: '${experienceUrl}'`)
            setIsRefreshError(true)
            setRefreshLoading(false)
        }
    }

    const embedCode = entry.fields[installationParameters.embedCodeFieldId].getValue()

    return (
        <>
            <div className={styles.body}>
                {isRefreshError && (
                    <Box marginBottom="spacingXl">
                        <Note variant="negative">
                            There was an error refreshing the embed code. Make sure the experience is still published.
                            If you still have trouble, try unlinking and relinking the experience.
                        </Note>
                    </Box>
                )}

                <img src={cerosLogo} alt="Ceros Logo" className={styles.logo} width="150px" />

                <Paragraph>
                    A Ceros experience is already linked to this entry. You can view it below or flip to the Editor view
                    to see the fields that your Contentful clients can use.
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

                <div className={styles.experienceEmbed} dangerouslySetInnerHTML={{ __html: embedCode }}></div>
            </div>
        </>
    )
}

const Entry = () => {
    const sdk = useSDK<EditorAppSDK>()
    let entry = sdk.entry

    // Extracting configuration from installation parameters
    const installationParameters: AppInstallationParameters = {
        contentTypeId: sdk.parameters.installation.contentTypeId,
        titleFieldId: sdk.parameters.installation.titleFieldId,
        urlFieldId: sdk.parameters.installation.urlFieldId,
        embedCodeFieldId: sdk.parameters.installation.embedCodeFieldId,
    }

    const initialState = Boolean(
        entry.fields[installationParameters.titleFieldId]?.getValue() &&
            entry.fields[installationParameters.embedCodeFieldId]?.getValue()
    )
    const [linked, setLinked] = useState(initialState)

    // Check if the app is fully configured
    if (Object.values(installationParameters).some((value) => value === null || value === undefined || value === '')) {
        return (
            <div className={styles.body}>
                <Note variant="negative">
                    The Ceros app isn't fully configured. Please go to the Ceros app configuration screen to configure
                    it.
                </Note>
            </div>
        )
    }

    // Check if content type of the entry matches with the one in the configuration
    const contentType = entry.getSys().contentType.sys.id
    if (contentType !== installationParameters.contentTypeId) {
        return (
            <div className={styles.body}>
                <Note variant="negative">
                    The content type of this entry isn't configured to use the Ceros app. Please go to the Ceros app
                    configuration screen to configure it.
                </Note>
            </div>
        )
    }

    return linked ? (
        <LinkedState
            key={linked.toString()}
            entry={entry}
            setLinked={setLinked}
            installationParameters={installationParameters}
        />
    ) : (
        <EmptyState
            key={linked.toString()}
            entry={entry}
            setLinked={setLinked}
            installationParameters={installationParameters}
        />
    )
}

export default Entry
