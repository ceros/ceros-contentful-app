import { EditorAppSDK, EntryAPI } from '@contentful/app-sdk'
import { Button, Form, FormControl, Paragraph, TextInput } from '@contentful/f36-components'
import { useSDK } from '@contentful/react-apps-toolkit'
import React, { Dispatch, useState } from 'react'
import cerosLogo from '../assets/ceros-logo.svg'
import styles from '../styles'
import { getExperienceMetadata } from '../util'

interface EmptyStateProps {
    entry: EntryAPI
    setLinked: Dispatch<any>
}

function EmptyState({ entry, setLinked }: EmptyStateProps) {
    const [experienceUrl, setExperienceUrl] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [isCerosExperienceInvalid, setIsCerosExperienceInvalid] = useState(false)

    const submitForm = async () => {
        // Set form to submitted
        setSubmitted(true)

        // Get experience metadata
        const experienceMetadata = await getExperienceMetadata(experienceUrl)

        // Check if the metadata was able to be retrieved
        if (experienceMetadata) {
            // Save experience metadata to fields
            entry.fields['title'].setValue(experienceMetadata['title'])
            entry.fields['url'].setValue(experienceMetadata['url'])
            entry.fields['oembed'].setValue(experienceMetadata)

            // Save entry
            entry.save().then(() => {
                setSubmitted(false)
                setLinked(true)
            })
        } else {
            console.warn(`Couldn't get experience metadata for url: '${experienceUrl}'`)
            setIsCerosExperienceInvalid(true)
            setSubmitted(false)
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

                <Form onSubmit={submitForm}>
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

                    <Button variant="positive" type="submit" isDisabled={submitted} isLoading={submitted}>
                        {submitted ? 'Linking Experience' : 'Link Experience'}
                    </Button>
                </Form>
            </div>
        </>
    )
}

function LinkedState({ entry, setLinked }: EmptyStateProps) {
    const [submitted, setSubmitted] = useState(false)
    const submitForm = async () => {
        // Set form to submitted
        setSubmitted(true)

        // Tell the app that the experience is no longer linked
        setLinked(false)

        // Clear entry fields
        for (const field of Object.values(entry.fields)) {
            field.removeValue()
        }

        // Save entry
        entry.save().then(() => {
            setSubmitted(false)
        })
    }

    // Get experience embed code
    const oembedData = entry.fields['oembed'].getValue()

    return (
        <>
            <div className={styles.body}>
                <img src={cerosLogo} alt="Ceros Logo" className={styles.logo} width="150px" />

                <Paragraph>
                    A Ceros experience is already linked to this entry. You can view it below or flip to the Editor view
                    to see the fields that your Contentful clients can use.
                </Paragraph>

                <Form onSubmit={submitForm}>
                    <Button variant="negative" type="submit" isDisabled={submitted} isLoading={submitted}>
                        {submitted ? 'Unlinking Experience' : 'Unlink Experience'}
                    </Button>
                </Form>

                <div className={styles.experienceEmbed} dangerouslySetInnerHTML={{ __html: oembedData['html'] }}></div>
            </div>
        </>
    )
}

const Entry = () => {
    const sdk = useSDK<EditorAppSDK>()

    // If experience has already been linked, show. Otherwise, show empty state.
    let entry = sdk.entry

    const initialState = Boolean(
        entry.fields.title.getValue() && entry.fields.url.getValue() && entry.fields.oembed.getValue()
    )
    const [linked, setLinked] = useState(initialState)

    return linked ? (
        <LinkedState key={linked.toString()} entry={entry} setLinked={setLinked} />
    ) : (
        <EmptyState key={linked.toString()} entry={entry} setLinked={setLinked} />
    )
}

export default Entry
