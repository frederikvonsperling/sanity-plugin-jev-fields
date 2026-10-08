import {defineLocaleResourceBundle} from 'sanity'

/** The plugin's translation namespace: `useTranslation(JEV_NAMESPACE)`. */
export const JEV_NAMESPACE = 'jev' as const

/**
 * Every string an editor sees, in US English. Other locales can add a bundle for the `jev`
 * namespace with the same keys. Config problems and validation messages stay in English: they
 * are for schema authors, and Sanity's validation has no translation hook.
 */
export const resources = {
  'strip.label': 'Jev',
  'strip.set-up': 'Set up Jev',
  'strip.evaluate-all': 'Evaluate all signals now',
  'chip.empty': '–',
  'chip.error': 'Error',
  'chip.out-of-date': 'Out of date',

  'detail.empty-field': 'Add content to this field to evaluate it.',
  'detail.not-evaluated': 'Not evaluated yet.',
  'detail.out-of-date': 'Out of date: the field changed since this was evaluated.',
  'detail.update-key': 'Update API key',
  'detail.try-again': 'Try again',
  'field.too-long':
    'This field is about {{tokens}}k tokens long. Jev reads at most {{limit}}k per question, so longer text may be refused.',

  'error.auth': 'AI Gateway rejected the API key. Check the key in the Jev tool.',
  'error.invalid': 'AI Gateway rejected the question: {{detail}}',
  'error.busy': 'AI Gateway is busy. Try again in a moment.',
  'error.failed': 'AI Gateway responded with {{status}}.',
  'error.failed-with-detail': 'AI Gateway responded with {{status}}: {{detail}}',
  'error.unexpected': 'AI Gateway returned no answer.',

  'noul.level.low': 'Low',
  'noul.level.medium': 'Medium',
  'noul.level.high': 'High',
  'noul.yes': 'Yes',
  'score.summary': '{{meaning}} (score {{score}} of {{max}}).',
  'score.next': 'To move up: {{next}}.',

  'key-dialog.title': 'AI Gateway API key',
  'key-dialog.label': 'API key',
  'key-dialog.description':
    'Create one in the Vercel dashboard under AI Gateway → API Keys, ideally with a spend limit. It is stored in this dataset, so Studio users and API tokens that can read the dataset can see it.',
  'key-dialog.cancel': 'Cancel',
  'key-dialog.save': 'Save',
  'key-dialog.saving': 'Saving…',
  'key-dialog.save-failed': 'Could not save the key: {{error}}',

  'tool.title': 'Jev',
  'tool.intro': 'Jev signals are answered by TypeSafe’s Jev model through Vercel AI Gateway.',
  'tool.key.heading': 'AI Gateway API key',
  'tool.key.status.config': 'From plugin config',
  'tool.key.status.checking': 'Checking',
  'tool.key.status.set': 'Set',
  'tool.key.status.not-set': 'Not set',
  'tool.key.from-transport':
    'Requests go through the transport in the plugin config, so no key is needed here.',
  'tool.key.from-config':
    'The key comes from apiKey in the plugin config. A key stored here is ignored.',
  'tool.key.ends-with': 'Key ending in <Code>{{last4}}</Code>',
  'tool.key.changed': 'Last changed {{date}}',
  'tool.key.checking': 'Checking for a stored key…',
  'tool.key.none': 'No key is stored, so Jev signals cannot evaluate yet.',
  'tool.key.set': 'Set key',
  'tool.key.change': 'Change key',
  'tool.key.remove': 'Remove key',
  'tool.key.remove-confirm': 'Remove the key? Jev signals stop evaluating until a new one is set.',
  'tool.key.remove-cancel': 'Cancel',
  'tool.key.remove-confirm-button': 'Remove',
  'tool.key.remove-failed': 'Could not remove the key: {{error}}',
  'tool.test.run': 'Test connection',
  'tool.test.running': 'Testing…',
  'tool.test.passed': 'Connection works. {{model}} answered.',
  'tool.visibility.heading': 'Who can see the key',
  'tool.visibility.body':
    'The key is stored in this dataset in the document <Code>secrets.jev</Code>. It is not public, but anyone who can read the dataset can see it: every Studio user, and every API token with read access, such as a frontend’s read or preview token. It is also included in dataset exports and backups. Use a dedicated key with a spend limit. If editors and tokens must never see the key, set a <Code>transport</Code> that sends requests through your own server.',
} as const

/** A key of the plugin's translations. */
export type JevTranslationKey = keyof typeof resources

export const jevLocaleBundle = defineLocaleResourceBundle({
  locale: 'en-US',
  namespace: JEV_NAMESPACE,
  resources,
})
