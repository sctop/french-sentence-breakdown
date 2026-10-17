export const POS_TAGS = [
  'n.',
  'v.',
  'adj.',
  'adv.',
  'pron.',
  'det.',
  'prep.',
  'conj.',
  'num.',
  'interj.',
  'aux.',
] as const

export type PosTag = (typeof POS_TAGS)[number]

export const POS_LABELS: Record<PosTag, string> = {
  'n.': '名词',
  'v.': '动词',
  'adj.': '形容词',
  'adv.': '副词',
  'pron.': '代词',
  'det.': '限定词',
  'prep.': '介词',
  'conj.': '连词',
  'num.': '数词',
  'interj.': '感叹词',
  'aux.': '助动词',
}

export type PosGroup = 'noun' | 'verb' | 'modifier' | 'function'

export const POS_GROUPS: Record<PosTag, PosGroup> = {
  'n.': 'noun',
  'v.': 'verb',
  'adj.': 'modifier',
  'adv.': 'modifier',
  'pron.': 'function',
  'det.': 'function',
  'prep.': 'function',
  'conj.': 'function',
  'num.': 'function',
  'interj.': 'function',
  'aux.': 'verb',
}

// Keys are lower-cased and without trailing periods.
const POS_ALIASES: Record<string, PosTag> = {
  n: 'n.',
  noun: 'n.',
  'common noun': 'n.',
  'proper noun': 'n.',
  v: 'v.',
  verb: 'v.',
  adj: 'adj.',
  adjective: 'adj.',
  adv: 'adv.',
  adverb: 'adv.',
  pron: 'pron.',
  pronoun: 'pron.',
  det: 'det.',
  determiner: 'det.',
  article: 'det.',
  art: 'det.',
  prep: 'prep.',
  preposition: 'prep.',
  conj: 'conj.',
  conjunction: 'conj.',
  num: 'num.',
  numeral: 'num.',
  number: 'num.',
  interj: 'interj.',
  interjection: 'interj.',
  aux: 'aux.',
  auxiliary: 'aux.',
  'auxiliary verb': 'aux.',
  'helping verb': 'aux.',
}

export function isPosTag(value: unknown): value is PosTag {
  return typeof value === 'string' && (POS_TAGS as readonly string[]).includes(value)
}

export const INFLECTING_POS_TAGS = ['v.', 'aux.', 'pron.', 'det.', 'n.'] as const

/** POS categories whose inflected form should be annotated in Chinese. */
export function supportsInflection(pos: PosTag): boolean {
  return (INFLECTING_POS_TAGS as readonly string[]).includes(pos)
}

export function normalizePos(raw: unknown): PosTag | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase().replace(/\.+$/, '')
  if (!key) return null
  return POS_ALIASES[key] ?? null
}
