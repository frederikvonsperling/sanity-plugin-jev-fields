import {Box, Button, Card, Dialog, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {useEffect, useId, useState} from 'react'
import {useClient, useDocumentPreviewStore, useTranslation} from 'sanity'

import {JEV_NAMESPACE} from './i18n'
import type {JevPluginConfig} from './types'

// Same document shape as @sanity/studio-secrets, so keys stored by either keep working.
const SECRETS_ID = 'secrets.jev'
const SECRETS_TYPE = 'pluginSecrets'

interface StoredKey {
  loading: boolean
  apiKey?: string
  /** When the secrets document last changed. */
  updatedAt?: string
}

/** The AI Gateway key stored in `secrets.jev`, kept up to date as it changes. */
export function useStoredKey(): StoredKey {
  const documentPreviewStore = useDocumentPreviewStore()
  const [stored, setStored] = useState<StoredKey>({loading: true})

  useEffect(() => {
    const subscription = documentPreviewStore
      .unstable_observeDocument(SECRETS_ID)
      .subscribe((document) => {
        const secrets = document?.secrets
        const apiKey =
          secrets && typeof secrets === 'object' && 'gatewayApiKey' in secrets
            ? secrets.gatewayApiKey
            : undefined
        setStored({
          loading: false,
          apiKey: typeof apiKey === 'string' && apiKey ? apiKey : undefined,
          updatedAt: document?._updatedAt,
        })
      })
    return () => subscription.unsubscribe()
  }, [documentPreviewStore])

  return stored
}

/** Stores a new key, or removes the stored one when `apiKey` is undefined. */
export function useSaveKey() {
  const client = useClient({apiVersion: '2025-02-19'})
  return async (apiKey: string | undefined) => {
    await client
      .transaction()
      .createIfNotExists({_id: SECRETS_ID, _type: SECRETS_TYPE})
      .patch(SECRETS_ID, (patch) =>
        apiKey ? patch.set({secrets: {gatewayApiKey: apiKey}}) : patch.unset(['secrets']),
      )
      .commit({tag: 'jev.secrets'})
  }
}

export type KeySource =
  /** `transport` or `apiKey` in the plugin config: nothing to set up in the Studio. */
  {from: 'config'; apiKey?: string} | {from: 'secrets'; loading: boolean; apiKey?: string}

/** Where the API key comes from: plugin config wins over the stored key. */
export function useKeySource(config: JevPluginConfig): KeySource {
  const stored = useStoredKey()
  if (config.transport || config.apiKey) return {from: 'config', apiKey: config.apiKey}
  return {from: 'secrets', loading: stored.loading, apiKey: stored.apiKey}
}

/** Dialog for entering or replacing the stored key. Closes once the key is saved. */
export function JevKeyDialog({onClose}: {onClose: () => void}) {
  const {t} = useTranslation(JEV_NAMESPACE)
  const saveKey = useSaveKey()
  const inputId = useId()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await saveKey(value.trim())
      onClose()
    } catch (saveError) {
      setSaving(false)
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  return (
    <Dialog id="jev-key-dialog" header={t('key-dialog.title')} onClose={onClose} width={1}>
      <Box
        as="form"
        padding={4}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Stack gap={4}>
          <Stack gap={3}>
            <Text as="label" htmlFor={inputId} size={1} weight="semibold">
              {t('key-dialog.label')}
            </Text>
            <Text size={1} muted>
              {t('key-dialog.description')}
            </Text>
            <TextInput
              id={inputId}
              type="password"
              autoComplete="off"
              value={value}
              disabled={saving}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          </Stack>

          {error && (
            <Card padding={3} radius={2} tone="critical">
              <Text size={1}>{t('key-dialog.save-failed', {error})}</Text>
            </Card>
          )}

          <Flex gap={2} justify="flex-end">
            <Button
              text={t('key-dialog.cancel')}
              mode="bleed"
              disabled={saving}
              onClick={onClose}
            />
            <Button
              type="submit"
              text={saving ? t('key-dialog.saving') : t('key-dialog.save')}
              tone="primary"
              disabled={saving || value.trim() === ''}
            />
          </Flex>
        </Stack>
      </Box>
    </Dialog>
  )
}
