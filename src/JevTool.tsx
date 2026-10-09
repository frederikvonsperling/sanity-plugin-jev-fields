import {Badge, Box, Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useState, type ReactNode} from 'react'
import {Translate, useTranslation} from 'sanity'

import {DEFAULT_MODEL, DEFAULT_TAGS, evaluateQuestion, resolveTransport} from './evaluate'
import {JEV_NAMESPACE} from './i18n'
import {bindQuestionToKind} from './kinds'
import {toQuestionError, type QuestionError} from './lifecycle'
import {noul} from './questions'
import {isKeyFromConfig, JevKeyDialog, useSaveKey, useStoredKey} from './secrets'
import type {JevPluginConfig} from './types'
import {translateQuestionError} from './ui'

const Code = ({children}: {children?: ReactNode}) => <code>{children}</code>

// One tiny yes/no question: costs a fraction of a cent.
const CONNECTION_TEST_QUESTION = bindQuestionToKind(
  noul({
    instructions: 'Is this text a connection test?',
    true: 'It is a test',
    false: 'It is not a test',
  }),
).gatewayQuestion

type ConnectionTestState =
  | {state: 'idle'}
  | {state: 'running'}
  | {state: 'passed'; model: string}
  | {state: 'failed'; error: QuestionError}

/** Studio tool for setting, checking and removing the stored AI Gateway key. */
export function JevTool({config}: {config: JevPluginConfig}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const stored = useStoredKey()
  const saveKey = useSaveKey()
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({state: 'idle'})

  // Same precedence as the fields: transport, then `apiKey` in config, then the stored key.
  const keyIsFromConfig = isKeyFromConfig(config)
  const transport = resolveTransport(config, config.apiKey ?? stored.apiKey)

  async function testConnection() {
    if (!transport || !CONNECTION_TEST_QUESTION) return

    setConnectionTest({state: 'running'})

    try {
      const result = await evaluateQuestion({
        transport,
        model: config.model ?? DEFAULT_MODEL,
        state: 'This is a connection test.',
        question: CONNECTION_TEST_QUESTION,
        tags: [...(config.tags ?? DEFAULT_TAGS), 'jev:connection-test'],
      })

      setConnectionTest({state: 'passed', model: result.model})
    } catch (error) {
      setConnectionTest({state: 'failed', error: toQuestionError(error)})
    }
  }

  async function removeStoredKey() {
    setIsConfirmingRemove(false)

    try {
      await saveKey(undefined)
      setConnectionTest({state: 'idle'})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      setConnectionTest({
        state: 'failed',
        error: {message: t('tool.key.remove-failed', {error: message})},
      })
    }
  }

  return (
    <Container width={1} padding={4}>
      <Stack gap={5}>
        <Stack gap={3}>
          <Heading size={2}>{t('tool.title')}</Heading>
          <Text muted size={1}>
            {t('tool.intro')}
          </Text>
        </Stack>

        <Card padding={4} radius={2} border>
          <Stack gap={4}>
            <Flex align="center" gap={3}>
              <Box flex={1}>
                <Heading size={0} as="h2">
                  {t('tool.key.heading')}
                </Heading>
              </Box>
              <KeyStatusBadge
                keyIsFromConfig={keyIsFromConfig}
                loading={stored.loading}
                storedKey={stored.apiKey}
              />
            </Flex>

            {keyIsFromConfig ? (
              <Text size={1} muted>
                {config.transport ? t('tool.key.from-transport') : t('tool.key.from-config')}
              </Text>
            ) : stored.apiKey ? (
              <Stack gap={3}>
                <Text size={1}>
                  <Translate
                    t={t}
                    i18nKey="tool.key.ends-with"
                    values={{last4: stored.apiKey.slice(-4)}}
                    components={{Code}}
                  />
                </Text>
                {stored.updatedAt && (
                  <Text size={1} muted>
                    {t('tool.key.changed', {date: new Date(stored.updatedAt).toLocaleString()})}
                  </Text>
                )}
              </Stack>
            ) : (
              <Text size={1} muted>
                {stored.loading ? t('tool.key.checking') : t('tool.key.none')}
              </Text>
            )}

            <Flex gap={2} wrap="wrap">
              {!keyIsFromConfig && (
                <Button
                  text={stored.apiKey ? t('tool.key.change') : t('tool.key.set')}
                  tone="primary"
                  disabled={stored.loading}
                  onClick={() => setKeyDialogOpen(true)}
                />
              )}
              <Button
                text={
                  connectionTest.state === 'running' ? t('tool.test.running') : t('tool.test.run')
                }
                mode="ghost"
                disabled={!transport || connectionTest.state === 'running'}
                onClick={testConnection}
              />
              {!keyIsFromConfig && stored.apiKey && !isConfirmingRemove && (
                <Button
                  text={t('tool.key.remove')}
                  mode="bleed"
                  tone="critical"
                  onClick={() => setIsConfirmingRemove(true)}
                />
              )}
            </Flex>

            {isConfirmingRemove && (
              <Card padding={3} radius={2} tone="critical">
                <Flex align="center" gap={2} wrap="wrap">
                  <Box flex={1}>
                    <Text size={1}>{t('tool.key.remove-confirm')}</Text>
                  </Box>
                  <Button
                    text={t('tool.key.remove-cancel')}
                    mode="bleed"
                    onClick={() => setIsConfirmingRemove(false)}
                  />
                  <Button
                    text={t('tool.key.remove-confirm-button')}
                    tone="critical"
                    onClick={removeStoredKey}
                  />
                </Flex>
              </Card>
            )}

            {connectionTest.state === 'passed' && (
              <Card padding={3} radius={2} tone="positive">
                <Text size={1}>{t('tool.test.passed', {model: connectionTest.model})}</Text>
              </Card>
            )}
            {connectionTest.state === 'failed' && (
              <Card padding={3} radius={2} tone="critical">
                <Text size={1}>{translateQuestionError(t, connectionTest.error)}</Text>
              </Card>
            )}
          </Stack>
        </Card>

        <Stack gap={3}>
          <Heading size={0} as="h2">
            {t('tool.visibility.heading')}
          </Heading>
          <Text size={1} muted>
            <Translate t={t} i18nKey="tool.visibility.body" components={{Code}} />
          </Text>
        </Stack>
      </Stack>

      {keyDialogOpen && (
        <JevKeyDialog
          onClose={() => {
            setKeyDialogOpen(false)
            setConnectionTest({state: 'idle'})
          }}
        />
      )}
    </Container>
  )
}

function KeyStatusBadge({
  keyIsFromConfig,
  loading,
  storedKey,
}: {
  keyIsFromConfig: boolean
  loading: boolean
  storedKey: string | undefined
}) {
  const {t} = useTranslation(JEV_NAMESPACE)

  if (keyIsFromConfig) return <Badge tone="primary">{t('tool.key.status.config')}</Badge>
  if (loading) return <Badge>{t('tool.key.status.checking')}</Badge>
  if (storedKey) return <Badge tone="positive">{t('tool.key.status.set')}</Badge>

  return <Badge tone="caution">{t('tool.key.status.not-set')}</Badge>
}
