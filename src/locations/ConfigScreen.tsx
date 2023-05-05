import React, { useCallback, useState, useEffect } from 'react'
import { ConfigAppSDK } from '@contentful/app-sdk'
import { Heading, Form, Paragraph, Flex, Button } from '@contentful/f36-components'
import { css } from 'emotion'
import { useCMA, useSDK } from '@contentful/react-apps-toolkit'
import { CONTENT_MODEL_NAME } from '../config'

// Define the type for the app installation parameters
export interface AppInstallationParameters {}

const ConfigScreen = () => {
    // State to store the app installation parameters
    const [parameters, setParameters] = useState<AppInstallationParameters>({})

    // State to store the existence of the content model
    const [contentModelExists, setContentModelExists] = useState(false)

    // Access to the SDK and CMA provided by the @contentful/react-apps-toolkit
    const sdk = useSDK<ConfigAppSDK>()

    const cma = useCMA()

    // Function to check if the content model already exists
    const checkContentModelExists = useCallback(async () => {
        const contentTypes = await cma.contentType.getMany({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
        })

        const cerosExperience = contentTypes.items.find(
            (contentType: { name: string }) => contentType.name === CONTENT_MODEL_NAME
        )

        setContentModelExists(!!cerosExperience)
    }, [cma, sdk.ids])

    // Function to create the content model and assign the app as an entry editor for all fields
    const createContentModel = useCallback(async () => {
        // Do nothing if the content model already exists
        if (contentModelExists) return

        const currentState = await sdk.app.getCurrentState()

        // Define the content model structure
        const contentType = {
            name: CONTENT_MODEL_NAME,
            displayField: 'title',
            fields: [
                {
                    id: 'title',
                    name: 'Title',
                    type: 'Symbol',
                    required: true,
                    localized: false,
                },
                {
                    id: 'url',
                    name: 'Experience URL',
                    type: 'Symbol',
                    required: true,
                    localized: false,
                },
                {
                    id: 'oembed',
                    name: 'oEmbed Data',
                    type: 'Object',
                    required: false,
                    localized: false,
                },
            ],
        }

        // Create the content model
        const createdContentType = await cma.contentType.create(
            {
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
            },
            contentType
        )
        await cma.contentType.publish({ contentTypeId: createdContentType.sys.id }, createdContentType)

        // Fetch the editor interface for the created content model
        const editorInterface = await cma.editorInterface.get({
            spaceId: sdk.ids.space,
            environmentId: sdk.ids.environment,
            contentTypeId: createdContentType.sys.id,
        })

        // Add the current app as an entry editor for all fields in the content model
        if (editorInterface.editors) {
            const currentAppEditorIndex = editorInterface.editors.findIndex(
                (editor) => editor.widgetNamespace === 'app' && editor.widgetId === sdk.ids.app
            )

            if (currentAppEditorIndex === -1) {
                editorInterface.editors.push({
                    widgetNamespace: 'app',
                    widgetId: sdk.ids.app,
                })
            }
        } else {
            editorInterface.editors = [
                {
                    widgetNamespace: 'app',
                    widgetId: sdk.ids.app,
                },
            ]
        }

        // Update the editor interface with the new configuration including the current app as an entry editor
        await cma.editorInterface.update(
            {
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
                contentTypeId: createdContentType.sys.id,
            },
            editorInterface
        )

        // Set the contentModelExists state to true since we've created the content model
        setContentModelExists(true)

        // Notify the SDK that the app is configured with the current parameters and target state
        sdk.app.onConfigure(() => {
            return {
                parameters,
                targetState: currentState,
            }
        })
    }, [contentModelExists, parameters, cma, sdk])

    // Effect to initialize the app parameters and set the app as ready
    useEffect(() => {
        ;(async () => {
            // Get the current parameters of the app
            const currentParameters: AppInstallationParameters | null = await sdk.app.getParameters()

            // Set the app parameters if they exist
            if (currentParameters) {
                setParameters(currentParameters)
            }

            // Set the app as ready to be displayed to the user
            sdk.app.setReady()
        })()
    }, [sdk])

    // Effect to check if the content model exists on component mount
    useEffect(() => {
        checkContentModelExists()
    }, [checkContentModelExists])

    // Render the configuration screen
    return (
        <Flex flexDirection="column" className={css({ margin: '80px', maxWidth: '800px' })}>
            <Form>
                <Heading>Ceros App Config</Heading>
                {contentModelExists ? (
                    <Paragraph>{'\u2705'} The content model has been created and the app is ready to use. Try creating a new '{CONTENT_MODEL_NAME}' entry!</Paragraph>
                ) : (
                    <>
                        <Paragraph>
                        {'\u261d'} In order to use this app, you first need to create a content model for a Ceros Experience.
                        </Paragraph>
                        <Button variant="primary" onClick={createContentModel}>
                            Create content model
                        </Button>
                    </>
                )}
            </Form>
        </Flex>
    )
}

export default ConfigScreen
