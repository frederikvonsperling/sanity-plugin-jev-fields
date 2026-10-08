import {Badge, Box, Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useState} from 'react'

import {DEFAULT_MODEL, DEFAULT_TAGS, evaluateQuestion, gatewayTransport} from './evaluate'
import {JevKeyDialog, useSaveKey, useStoredKey} from './secrets'
import type {JevPluginConfig} from './types'

type TestState =
  | {state: 'idle'}
  | {state: 'running'}
  | {state: 'passed'; model: string}
  | {state: 'failed'; message: string}

/** Studio tool for setting, checking and removing the stored AI Gateway key. */
export function JevTool({config}: {config: JevPluginConfig}) {
  const stored = useStoredKey()
  const saveKey = useSaveKey()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [test, setTest] = useState<TestState>({state: 'idle'})

  // Same precedence as the fields: transport, then `apiKey` in config, then the stored key.
  const fromConfig = !!(config.transport || config.apiKey)
  const apiKey = config.apiKey ?? stored.apiKey
  const transport =
    config.transport ?? (apiKey ? gatewayTransport(apiKey, config.endpoint) : undefined)

  async function testConnection() {
    if (!transport) return
    setTest({state: 'running'})
    try {
      // One tiny yes/no question: costs a fraction of a cent.
      const result = await evaluateQuestion({
        transport,
        model: config.model ?? DEFAULT_MODEL,
        state: 'This is a connection test.',
        question: {
          type: 'boolean',
          instructions: 'Is this text a connection test?',
          criteria: {true: 'It is a test', false: 'It is not a test'},
        },
        tags: [...(config.tags ?? DEFAULT_TAGS), 'jev:connection-test'],
      })
      setTest({state: 'passed', model: result.model})
    } catch (error) {
      setTest({state: 'failed', message: error instanceof Error ? error.message : String(error)})
    }
  }

  return (
    <Container width={1} padding={4}>
      <Stack gap={5}>
        <Stack gap={3}>
          <Heading size={2}>Jev</Heading>
          <Text muted size={1}>
            Jev fields are answered by TypeSafe&rsquo;s Jev model through Vercel AI Gateway.
          </Text>
        </Stack>

        <Card padding={4} radius={2} border>
          <Stack gap={4}>
            <Flex align="center" gap={3}>
              <Box flex={1}>
                <Heading size={0} as="h2">
                  AI Gateway API key
                </Heading>
              </Box>
              <KeyStatus fromConfig={fromConfig} loading={stored.loading} stored={stored.apiKey} />
            </Flex>

            {fromConfig ? (
              <Text size={1} muted>
                {config.transport
                  ? 'Requests go through the transport in the plugin config, so no key is needed here.'
                  : 'The key comes from apiKey in the plugin config. A key stored here is ignored.'}
              </Text>
            ) : stored.apiKey ? (
              <Stack gap={3}>
                <Text size={1}>
                  Key ending in <code>{stored.apiKey.slice(-4)}</code>
                </Text>
                {stored.updatedAt && (
                  <Text size={1} muted>
                    Last changed {new Date(stored.updatedAt).toLocaleString()}
                  </Text>
                )}
              </Stack>
            ) : (
              <Text size={1} muted>
                {stored.loading
                  ? 'Checking for a stored key…'
                  : 'No key is stored, so Jev fields cannot evaluate yet.'}
              </Text>
            )}

            <Flex gap={2} wrap="wrap">
              {!fromConfig && (
                <Button
                  text={stored.apiKey ? 'Change key' : 'Set key'}
                  tone="primary"
                  disabled={stored.loading}
                  onClick={() => setSettingsOpen(true)}
                />
              )}
              <Button
                text={test.state === 'running' ? 'Testing…' : 'Test connection'}
                mode="ghost"
                disabled={!transport || test.state === 'running'}
                onClick={testConnection}
              />
              {!fromConfig && stored.apiKey && !confirmRemove && (
                <Button
                  text="Remove key"
                  mode="bleed"
                  tone="critical"
                  onClick={() => setConfirmRemove(true)}
                />
              )}
            </Flex>

            {confirmRemove && (
              <Card padding={3} radius={2} tone="critical">
                <Flex align="center" gap={2} wrap="wrap">
                  <Box flex={1}>
                    <Text size={1}>
                      Remove the key? Jev fields stop evaluating until a new one is set.
                    </Text>
                  </Box>
                  <Button text="Cancel" mode="bleed" onClick={() => setConfirmRemove(false)} />
                  <Button
                    text="Remove"
                    tone="critical"
                    onClick={async () => {
                      setConfirmRemove(false)
                      try {
                        await saveKey(undefined)
                        setTest({state: 'idle'})
                      } catch (error) {
                        const message = error instanceof Error ? error.message : String(error)
                        setTest({state: 'failed', message: `Could not remove the key: ${message}`})
                      }
                    }}
                  />
                </Flex>
              </Card>
            )}

            {test.state === 'passed' && (
              <Card padding={3} radius={2} tone="positive">
                <Text size={1}>Connection works. {test.model} answered.</Text>
              </Card>
            )}
            {test.state === 'failed' && (
              <Card padding={3} radius={2} tone="critical">
                <Text size={1}>{test.message}</Text>
              </Card>
            )}
          </Stack>
        </Card>

        <Stack gap={3}>
          <Heading size={0} as="h2">
            Who can see the key
          </Heading>
          <Text size={1} muted>
            The key is stored in this dataset in the document <code>secrets.jev</code>. It is not
            public, but anyone who can read the dataset can see it: every Studio user, and every API
            token with read access, such as a frontend&rsquo;s read or preview token. It is also
            included in dataset exports and backups. Use a dedicated key with a spend limit. If
            editors and tokens must never see the key, set a <code>transport</code> that sends
            requests through your own server.
          </Text>
        </Stack>
      </Stack>

      {settingsOpen && (
        <JevKeyDialog
          onClose={() => {
            setSettingsOpen(false)
            setTest({state: 'idle'})
          }}
        />
      )}
    </Container>
  )
}

function KeyStatus({
  fromConfig,
  loading,
  stored,
}: {
  fromConfig: boolean
  loading: boolean
  stored: string | undefined
}) {
  if (fromConfig) return <Badge tone="primary">From plugin config</Badge>
  if (loading) return <Badge>Checking</Badge>
  return stored ? <Badge tone="positive">Set</Badge> : <Badge tone="caution">Not set</Badge>
}
