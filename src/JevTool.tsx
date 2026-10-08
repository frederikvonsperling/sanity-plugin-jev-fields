import {Badge, Box, Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useState, type ReactNode} from 'react'
import {Translate, useTranslation} from 'sanity'

import {DEFAULT_MODEL, DEFAULT_TAGS, evaluateQuestion, gatewayTransport, JevError} from './evaluate'
import {JEV_NAMESPACE} from './i18n'
import {kindOf} from './kinds'
import type {QuestionError} from './lifecycle'
import {noul} from './questions'
import {JevKeyDialog, useSaveKey, useStoredKey} from './secrets'
import type {JevPluginConfig} from './types'
import {errorText} from './ui'

const Code = ({children}: {children?: ReactNode}) => <code>{children}</code>

// One tiny yes/no question: costs a fraction of a cent.
const CONNECTION_TEST = kindOf(
  noul({
    instructions: 'Is this text a connection test?',
    true: 'It is a test',
    false: 'It is not a test',
  }),
).gatewayQuestion

type TestState =
  | {state: 'idle'}
  | {state: 'running'}
  | {state: 'passed'; model: string}
  | {state: 'failed'; error: QuestionError}

const asQuestionError = (error: unknown): QuestionError =>
  error instanceof JevError
    ? {message: error.message, kind: error.kind, status: error.status, detail: error.detail}
    : {message: error instanceof Error ? error.message : String(error)}

/** Studio tool for setting, checking and removing the stored AI Gateway key. */
export function JevTool({config}: {config: JevPluginConfig}) {
  const {t} = useTranslation(JEV_NAMESPACE)
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
    if (!transport || !CONNECTION_TEST) return
    setTest({state: 'running'})
    try {
      const result = await evaluateQuestion({
        transport,
        model: config.model ?? DEFAULT_MODEL,
        state: 'This is a connection test.',
        question: CONNECTION_TEST,
        tags: [...(config.tags ?? DEFAULT_TAGS), 'jev:connection-test'],
      })
      setTest({state: 'passed', model: result.model})
    } catch (error) {
      setTest({state: 'failed', error: asQuestionError(error)})
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
              <KeyStatus fromConfig={fromConfig} loading={stored.loading} stored={stored.apiKey} />
            </Flex>

            {fromConfig ? (
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
              {!fromConfig && (
                <Button
                  text={stored.apiKey ? t('tool.key.change') : t('tool.key.set')}
                  tone="primary"
                  disabled={stored.loading}
                  onClick={() => setSettingsOpen(true)}
                />
              )}
              <Button
                text={test.state === 'running' ? t('tool.test.running') : t('tool.test.run')}
                mode="ghost"
                disabled={!transport || test.state === 'running'}
                onClick={testConnection}
              />
              {!fromConfig && stored.apiKey && !confirmRemove && (
                <Button
                  text={t('tool.key.remove')}
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
                    <Text size={1}>{t('tool.key.remove-confirm')}</Text>
                  </Box>
                  <Button
                    text={t('tool.key.remove-cancel')}
                    mode="bleed"
                    onClick={() => setConfirmRemove(false)}
                  />
                  <Button
                    text={t('tool.key.remove-confirm-button')}
                    tone="critical"
                    onClick={async () => {
                      setConfirmRemove(false)
                      try {
                        await saveKey(undefined)
                        setTest({state: 'idle'})
                      } catch (error) {
                        const message = error instanceof Error ? error.message : String(error)
                        setTest({
                          state: 'failed',
                          error: {message: t('tool.key.remove-failed', {error: message})},
                        })
                      }
                    }}
                  />
                </Flex>
              </Card>
            )}

            {test.state === 'passed' && (
              <Card padding={3} radius={2} tone="positive">
                <Text size={1}>{t('tool.test.passed', {model: test.model})}</Text>
              </Card>
            )}
            {test.state === 'failed' && (
              <Card padding={3} radius={2} tone="critical">
                <Text size={1}>{errorText(t, test.error)}</Text>
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
  const {t} = useTranslation(JEV_NAMESPACE)
  if (fromConfig) return <Badge tone="primary">{t('tool.key.status.config')}</Badge>
  if (loading) return <Badge>{t('tool.key.status.checking')}</Badge>
  return stored ? (
    <Badge tone="positive">{t('tool.key.status.set')}</Badge>
  ) : (
    <Badge tone="caution">{t('tool.key.status.not-set')}</Badge>
  )
}
