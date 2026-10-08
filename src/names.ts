/** Schema type names. Stored as `_type` on every value, so frontends query them: keep stable. */
export const TYPE_NAMES = {
  noul: 'jev.noul',
  score: 'jev.score',
  choice: 'jev.choice',
  choiceProbability: 'jev.choiceProbability',
} as const

export type JevTypeName = (typeof TYPE_NAMES)['noul' | 'score' | 'choice']
