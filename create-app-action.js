#!/usr/bin/env node
// Creates or updates the App Action that links the CerosApi Contentful Function
// to an invocable action. Run after every deploy that changes the parameter list.
//
//   CONTENTFUL_ORG_ID=xxx CONTENTFUL_APP_DEF_ID=xxx CONTENTFUL_ACCESS_TOKEN=xxx \
//     node create-app-action.js
//
// Or with a .env file (requires `dotenv` — install with: npm i -D dotenv):
//   node -r dotenv/config create-app-action.js

const { createClient } = require('contentful-management')

const orgId = process.env.CONTENTFUL_ORG_ID
const appDefId = process.env.CONTENTFUL_APP_DEF_ID
const token = process.env.CONTENTFUL_ACCESS_TOKEN

if (!orgId || !appDefId || !token) {
  console.error(
    'Missing required environment variables:\n' +
      '  CONTENTFUL_ORG_ID\n' +
      '  CONTENTFUL_APP_DEF_ID\n' +
      '  CONTENTFUL_ACCESS_TOKEN'
  )
  process.exit(1)
}

const client = createClient({ accessToken: token }, { type: 'plain' })

// Parameters must be declared here for Contentful to pass them through to
// the function handler's event.body. Undeclared parameters are stripped.
const ACTION_DEFINITION = {
  name: 'CerosApi',
  category: 'Custom',
  description: 'Fetches experiences from the Ceros REST API via the CerosApi Contentful Function.',
  type: 'function-invocation',
  function: {
    sys: {
      type: 'Link',
      linkType: 'Function',
      id: 'CerosApi',
    },
  },
  parameters: [
    {
      id: 'action',
      name: 'Action',
      type: 'Symbol',
      required: true,
      description: 'One of: getFolderTree | getFolderExperiences | getEmbedCode',
    },
    {
      id: 'folderId',
      name: 'Folder ID',
      type: 'Symbol',
      required: false,
      description: 'Required for getFolderExperiences',
    },
    {
      id: 'resourceId',
      name: 'Resource ID',
      type: 'Symbol',
      required: false,
      description: 'Required for getEmbedCode',
    },
    {
      id: 'query',
      name: 'Query',
      type: 'Symbol',
      required: false,
      description: 'JSON string of query params for the target endpoint (whitelisted per action)',
    },
  ],
}

async function main() {
  const existing = await client.appAction.getMany({ organizationId: orgId, appDefinitionId: appDefId })
  const found = existing.items.find((a) => a.name === 'CerosApi')

  if (found) {
    // Update in place so the parameter schema matches the current function handler.
    await client.appAction.update(
      { organizationId: orgId, appDefinitionId: appDefId, appActionId: found.sys.id },
      { ...ACTION_DEFINITION, sys: found.sys }
    )
    console.log(`Updated App Action "CerosApi" (id: ${found.sys.id})`)
    return
  }

  const action = await client.appAction.create(
    { organizationId: orgId, appDefinitionId: appDefId },
    ACTION_DEFINITION
  )
  console.log(`Created App Action "CerosApi" (id: ${action.sys.id})`)
}

main().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})
