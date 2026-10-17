import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LlmError,
  analyzeSentences,
  normalizeBaseUrl,
  parseAnalysisPayload,
  resolveChatCompletionsUrl,
  resolveModelsUrl,
  translateToFrench,
} from '../src/lib/llm.ts'
import { normalizePos } from '../src/lib/pos.ts'
import { chunkSentences, splitSentences } from '../src/lib/sentence.ts'
import { normalizeForSearch } from '../src/lib/text.ts'
import {
  MAX_HISTORY_RECORDS,
  buildStarredHistoryExport,
  createHistoryRecord,
  normalizeHistoryState,
  serializeHistory,
} from '../src/lib/history.ts'
import { buildFullBackup } from '../src/lib/backup.ts'
import {
  buildVocabularyExport,
  mergeVocabularyEntries,
  parseImportText,
  parseImportedEntries,
} from '../src/lib/vocabulary.ts'

const ANALYSIS_OBJECT = {
  sentences: [
    {
      source: 'Bonjour.',
      translation: 'Hello!',
      tokens: [
        {
          text: 'Bonjour',
          pos: 'interj.',
          inflection: '',
          lemma: 'bonjour',
          meaning: 'hello',
          respelling: 'bohn·zhoor',
          ipa: '/bɔ̃.ʒuʁ/',
        },
      ],
    },
  ],
}

function completionResponse(content = JSON.stringify(ANALYSIS_OBJECT), finishReason = 'stop') {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('splitSentences handles French punctuation, quotes and full-width marks', () => {
  assert.deepEqual(
    splitSentences('Bonjour ! Comment vas-tu ? Je vais bien ; et toi. « Salut ! » Ensuite'),
    ['Bonjour !', 'Comment vas-tu ?', 'Je vais bien ;', 'et toi.', '« Salut ! »', 'Ensuite'],
  )

  assert.deepEqual(splitSentences('你好。再见！真的吗？好的；走吧'), [
    '你好。',
    '再见！',
    '真的吗？',
    '好的；',
    '走吧',
  ])

  assert.deepEqual(splitSentences('Bonjour!Ça va?'), ['Bonjour!', 'Ça va?'])
})

test('splitSentences protects decimals and titles, keeps the final fragment', () => {
  assert.deepEqual(splitSentences('Le prix est 3.14 euros. M. Dupont arrive. Génial...'), [
    'Le prix est 3.14 euros.',
    'M. Dupont arrive.',
    'Génial...',
  ])

  assert.deepEqual(splitSentences('Merci beaucoup'), ['Merci beaucoup'])
  assert.deepEqual(splitSentences(' ... ! '), [])
  assert.deepEqual(splitSentences('   '), [])
})

test('chunkSentences respects sentence and character limits', () => {
  assert.deepEqual(chunkSentences([]), [])

  const longBatches = chunkSentences(['a'.repeat(700), 'b'.repeat(700), 'c'], 8, 1200)
  assert.deepEqual(
    longBatches.map((batch) => batch.length),
    [1, 2],
  )

  const countBatches = chunkSentences(
    Array.from({ length: 9 }, () => 'x'),
    8,
    1200,
  )
  assert.deepEqual(
    countBatches.map((batch) => batch.length),
    [8, 1],
  )
})

test('POS aliases normalize to the fixed English tag set', () => {
  assert.equal(normalizePos('Noun'), 'n.')
  assert.equal(normalizePos('art.'), 'det.')
  assert.equal(normalizePos('auxiliary verb'), 'aux.')
  assert.equal(normalizePos('Adjective'), 'adj.')
  assert.equal(normalizePos('punct.'), null)
  assert.equal(normalizePos(42), null)
})

test('search normalization ignores case, accents and ligatures', () => {
  const normalized = normalizeForSearch('Élève, CŒUR !')
  assert.ok(normalized.includes('eleve'))
  assert.ok(normalized.includes('coeur'))
})

test('vocabulary import trims fields, normalizes POS and reports invalid rows', () => {
  const parsed = parseImportedEntries({
    format: 'french-sentence-breakdown/vocabulary',
    version: 1,
    entries: [
      {
        id: 'id-1',
        word: '  Pomme ',
        pos: 'noun',
        lemma: ' pomme ',
        meaning: ' apple ',
        respelling: ' pom ',
        ipa: ' /pɔm/ ',
        context: ' Je mange une pomme. ',
        addedAt: '2026-01-02T03:04:05.000Z',
      },
      { word: '', pos: 'n.', meaning: 'invalid word' },
      { word: 'livre', pos: 'punct.', meaning: 'book' },
    ],
  })

  assert.equal(parsed.invalid, 2)
  assert.equal(parsed.entries.length, 1)
  assert.equal(parsed.entries[0].word, 'Pomme')
  assert.equal(parsed.entries[0].pos, 'n.')
  assert.equal(parsed.entries[0].meaning, 'apple')
  assert.equal(parsed.entries[0].respelling, 'pom')
  assert.equal(parsed.entries[0].ipa, '/pɔm/')

  assert.throws(() => parseImportedEntries({ version: 2, entries: [] }), /高于当前支持版本/)
  assert.throws(() => parseImportText('{bad json'), /合法的 JSON/)
  assert.deepEqual(parseImportedEntries([]).entries, [])
})

test('vocabulary export is versioned and merge de-duplicates by word + POS', () => {
  const existing = [
    {
      id: 'id-1',
      word: 'pomme',
      pos: 'n.',
      lemma: 'pomme',
      meaning: 'apple',
      respelling: 'pom',
      ipa: '/pɔm/',
      context: '',
      addedAt: '2026-01-02T03:04:05.000Z',
    },
  ]

  const sameWord = { ...existing[0], id: 'id-2', word: 'Pomme' }
  const newWord = { ...existing[0], id: 'id-3', word: 'livre', meaning: 'book' }
  const duplicateNewWord = { ...existing[0], id: 'id-4', word: 'Livre', meaning: 'book' }

  const merged = mergeVocabularyEntries(existing, [sameWord, newWord, duplicateNewWord])
  assert.equal(merged.added, 1)
  assert.equal(merged.skipped, 2)
  assert.equal(merged.entries.length, 2)

  const exported = buildVocabularyExport(merged.entries, new Date('2026-06-09T00:00:00.000Z'))
  assert.equal(exported.format, 'french-sentence-breakdown/vocabulary')
  assert.equal(exported.version, 1)
  assert.equal(exported.exportedAt, '2026-06-09T00:00:00.000Z')
  assert.equal(exported.entries.length, 2)
  assert.equal(exported.entries[0].respelling, 'pom')
  assert.equal(exported.entries[0].ipa, '/pɔm/')
})

test('history records clone analysis tokens and count words', () => {
  const token = {
    text: 'Bonjour',
    pos: 'interj.',
    inflection: '',
    lemma: 'bonjour',
    meaning: 'hello',
    respelling: 'bohn·zhoor',
    ipa: '/bɔ̃.ʒuʁ/',
  }
  const record = createHistoryRecord(
    {
      mode: 'english',
      input: 'Hello.',
      translatedText: 'Bonjour.',
      sentences: [{ source: 'Bonjour.', translation: 'Hello!', tokens: [token] }],
      usedCompatMode: true,
    },
    new Date('2026-06-09T00:00:00.000Z'),
  )

  assert.ok(record)
  assert.equal(record.createdAt, '2026-06-09T00:00:00.000Z')
  assert.equal(record.mode, 'english')
  assert.equal(record.input, 'Hello.')
  assert.equal(record.translatedText, 'Bonjour.')
  assert.equal(record.tokenCount, 1)
  assert.equal(record.usedCompatMode, true)
  assert.equal(record.sentences[0].translation, 'Hello!')
  assert.deepEqual(record.sentences[0].tokens[0], token)
  assert.notEqual(record.sentences[0].tokens[0], token)
})

test('history normalization preserves compact inflection labels', () => {
  const token = {
    text: 'mange',
    pos: 'v.',
    inflection: '直现·一单',
    lemma: 'manger',
    meaning: 'eat',
    respelling: 'mahnzh',
    ipa: '/mɑ̃ʒ/',
  }
  const record = createHistoryRecord({
    input: 'Je mange.',
    sentences: [{ source: 'Je mange.', translation: 'I eat.', tokens: [token] }],
    usedCompatMode: false,
  })
  assert.ok(record)
  assert.equal(record.sentences[0].tokens[0].inflection, '直现·一单')

  const legacyToken = { ...token }
  delete legacyToken.inflection
  const normalized = normalizeHistoryState([
    {
      input: 'Je mange.',
      sentences: [{ source: 'Je mange.', translation: 'I eat.', tokens: [legacyToken] }],
      usedCompatMode: false,
    },
  ])
  assert.equal(normalized.records[0].sentences[0].tokens[0].inflection, '')
})

test('history normalization keeps newest 100 regular records and preserves starred records', () => {
  const many = Array.from({ length: 105 }, (_, index) => ({
    id: `history-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    input: `Phrase ${index}.`,
    sentences: [
      {
        source: `Phrase ${index}.`,
        translation: `Translation ${index}.`,
        tokens: [
          { text: 'bonjour', pos: 'interj.', lemma: 'bonjour', meaning: 'hello' },
          { text: '!', pos: 'punct.', lemma: '', meaning: '' },
        ],
      },
    ],
    usedCompatMode: index % 2 === 0,
  }))
  many.push({ id: 'invalid', createdAt: 'not-a-date', input: '', sentences: [] })

  const starredRecord = {
    ...many[0],
    id: 'starred-1',
    createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0)).toISOString(),
    input: 'Starred phrase.',
  }

  const normalized = normalizeHistoryState({
    version: 1,
    records: many,
    starred: [starredRecord, { ...starredRecord, id: 'starred-2' }],
  })

  assert.equal(normalized.records.length, MAX_HISTORY_RECORDS)
  assert.equal(normalized.records[0].id, 'history-104')
  assert.equal(normalized.records[normalized.records.length - 1].id, 'history-5')
  assert.equal(normalized.records[0].sentences[0].tokens.length, 1)
  assert.equal(normalized.records[0].sentences[0].translation, 'Translation 104.')
  assert.equal(normalized.records[0].tokenCount, 1)
  assert.equal(normalized.records[0].sentences[0].tokens[0].respelling, '')
  assert.equal(normalized.records[0].sentences[0].tokens[0].ipa, '')
  assert.equal(normalized.records[0].usedCompatMode, true)
  assert.equal(normalized.records[0].mode, 'french')
  assert.equal(normalized.records[0].translatedText, '')
  assert.deepEqual(
    normalized.starred.map((record) => record.id),
    ['starred-1', 'starred-2'],
  )

  const legacy = normalizeHistoryState([many[0]])
  assert.equal(legacy.records.length, 1)
  assert.deepEqual(legacy.starred, [])

  const legacyEnvelope = normalizeHistoryState({ version: 1, records: [many[0]] })
  assert.equal(legacyEnvelope.records.length, 1)
  assert.deepEqual(legacyEnvelope.starred, [])

  const legacyNoTranslation = normalizeHistoryState([
    {
      ...many[0],
      sentences: [{ source: many[0].sentences[0].source, tokens: many[0].sentences[0].tokens }],
    },
  ])
  assert.equal(legacyNoTranslation.records[0].sentences[0].translation, '')

  const duplicateAcrossCollections = normalizeHistoryState({
    version: 1,
    records: [starredRecord],
    starred: [starredRecord],
  })
  assert.equal(duplicateAcrossCollections.records.length, 0)
  assert.equal(duplicateAcrossCollections.starred.length, 1)
})

test('starred history export and full backup include the persistent records', () => {
  const timestamp = new Date('2026-06-09T00:00:00.000Z')
  const record = {
    id: 'starred-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    mode: 'english',
    input: 'Hello.',
    translatedText: 'Bonjour.',
    sentences: [
      {
        source: 'Bonjour.',
        translation: 'Hello!',
        tokens: [
          {
            text: 'Bonjour',
            pos: 'interj.',
            lemma: 'bonjour',
            meaning: 'hello',
            respelling: 'bohn·zhoor',
            ipa: '/bɔ̃.ʒuʁ/',
          },
        ],
      },
    ],
    tokenCount: 1,
    usedCompatMode: false,
  }
  const vocabulary = [
    {
      id: 'vocab-1',
      word: 'pomme',
      pos: 'n.',
      lemma: 'pomme',
      meaning: 'apple',
      respelling: 'pom',
      ipa: '/pɔm/',
      context: 'Je mange une pomme.',
      addedAt: '2026-06-01T00:00:00.000Z',
    },
  ]

  const starredExport = buildStarredHistoryExport([record], timestamp)
  assert.equal(starredExport.format, 'french-sentence-breakdown/starred-history')
  assert.equal(starredExport.version, 1)
  assert.equal(starredExport.exportedAt, '2026-06-09T00:00:00.000Z')
  assert.equal(starredExport.records.length, 1)
  assert.equal(starredExport.records[0].mode, 'english')
  assert.equal(starredExport.records[0].translatedText, 'Bonjour.')

  const backup = buildFullBackup(vocabulary, [record], timestamp)
  assert.equal(backup.format, 'french-sentence-breakdown/backup')
  assert.equal(backup.version, 1)
  assert.equal(backup.exportedAt, '2026-06-09T00:00:00.000Z')
  assert.equal(backup.vocabulary.length, 1)
  assert.equal(backup.starredHistory.length, 1)
  assert.equal(backup.starredHistory[0].mode, 'english')
  assert.equal(backup.starredHistory[0].translatedText, 'Bonjour.')
})

test('history serialization round-trips regular and starred collections', () => {
  const token = {
    text: 'Bonjour',
    pos: 'interj.',
    lemma: 'bonjour',
    meaning: 'hello',
    respelling: 'bohn·zhoor',
    ipa: '/bɔ̃.ʒuʁ/',
  }
  const makeRecord = (id, createdAt) => ({
    id,
    createdAt,
    input: 'Bonjour.',
    sentences: [{ source: 'Bonjour.', translation: 'Hello!', tokens: [token] }],
    tokenCount: 1,
    usedCompatMode: false,
  })
  const regular = makeRecord('regular-1', '2026-06-02T00:00:00.000Z')
  const starred = makeRecord('starred-1', '2026-06-01T00:00:00.000Z')

  const roundTripped = normalizeHistoryState(JSON.parse(serializeHistory([regular], [starred])))
  assert.equal(roundTripped.records.length, 1)
  assert.equal(roundTripped.starred.length, 1)
  assert.equal(roundTripped.records[0].id, 'regular-1')
  assert.equal(roundTripped.starred[0].id, 'starred-1')
  assert.equal(roundTripped.starred[0].sentences[0].translation, 'Hello!')
  assert.equal(roundTripped.starred[0].sentences[0].tokens[0].ipa, '/bɔ̃.ʒuʁ/')
})

test('API URL helpers accept base URLs and full endpoints', () => {
  assert.deepEqual(normalizeBaseUrl(' api.example.com/v1/ '), {
    ok: true,
    url: 'https://api.example.com/v1',
  })
  assert.equal(normalizeBaseUrl('ftp://example.com').ok, false)
  assert.equal(normalizeBaseUrl('').ok, false)

  assert.equal(
    resolveChatCompletionsUrl('https://api.example.com/v1'),
    'https://api.example.com/v1/chat/completions',
  )
  assert.equal(
    resolveChatCompletionsUrl('https://api.example.com/v1/chat/completions/'),
    'https://api.example.com/v1/chat/completions',
  )
  assert.equal(
    resolveModelsUrl('https://api.example.com/v1/chat/completions'),
    'https://api.example.com/v1/models',
  )
})

test('parseAnalysisPayload accepts fenced JSON, content arrays and skips punctuation tokens', () => {
  const content = JSON.stringify({
    sentences: [
      {
        source: 'Bonjour.',
        translation: 'Hello!',
        tokens: [
          {
            text: 'Bonjour',
            pos: 'interj.',
            lemma: 'bonjour',
            meaning: 'hello',
            respelling: 'bohn·zhoor',
            ipa: 'bɔ̃.ʒuʁ',
          },
          { text: '!', pos: 'punct.', lemma: '', meaning: '' },
        ],
      },
    ],
  })

  const fenced = parseAnalysisPayload(
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: '```json\n' + content + '\n```' },
        },
      ],
    },
    ['Bonjour.'],
  )
  assert.equal(fenced.length, 1)
  assert.equal(fenced[0].translation, 'Hello!')
  assert.equal(fenced[0].tokens.length, 1)
  assert.equal(fenced[0].tokens[0].pos, 'interj.')
  assert.equal(fenced[0].tokens[0].respelling, 'bohn·zhoor')
  assert.equal(fenced[0].tokens[0].ipa, '/bɔ̃.ʒuʁ/')

  const fromParts = parseAnalysisPayload(
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: [{ type: 'text', text: content }] },
        },
      ],
    },
    ['Bonjour.'],
  )
  assert.equal(fromParts[0].translation, 'Hello!')
  assert.equal(fromParts[0].tokens[0].meaning, 'hello')

  assert.throws(
    () =>
      parseAnalysisPayload(
        {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  sentences: [{ source: 'Bonjour.', tokens: [] }],
                }),
              },
            },
          ],
        },
        ['Bonjour.'],
      ),
    /没有返回任何可用的词语/,
  )
})

test('parseAnalysisPayload keeps compact inflection labels only for inflecting POS', () => {
  const content = JSON.stringify({
    sentences: [
      {
        source: 'Je mange une pomme.',
        translation: 'I am eating an apple.',
        tokens: [
          {
            text: 'Je',
            pos: 'pron.',
            inflection: '主·一单',
            lemma: 'je',
            meaning: 'I',
          },
          {
            text: 'mange',
            pos: 'v.',
            inflection: '直现·一单',
            lemma: 'manger',
            meaning: 'eat',
          },
          {
            text: 'une',
            pos: 'det.',
            inflection: '不定·阴单',
            lemma: 'un',
            meaning: 'a',
          },
          {
            text: 'pomme',
            pos: 'n.',
            inflection: '阴单',
            lemma: 'pomme',
            meaning: 'apple',
          },
          {
            text: 'vraiment',
            pos: 'adv.',
            inflection: '不应保留',
            lemma: 'vraiment',
            meaning: 'really',
          },
        ],
      },
    ],
  })

  const parsed = parseAnalysisPayload(
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { content },
        },
      ],
    },
    ['Je mange une pomme.'],
  )

  assert.deepEqual(
    parsed[0].tokens.map((token) => token.inflection),
    ['主·一单', '直现·一单', '不定·阴单', '阴单', ''],
  )
})

test('parseAnalysisPayload rejects unknown POS and wrong sentence counts', () => {
  const unknownPos = {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            sentences: [
              {
                source: 'Bonjour.',
                translation: 'Hello!',
                tokens: [{ text: 'Bonjour', pos: 'greeting.', lemma: 'bonjour', meaning: 'hi' }],
              },
            ],
          }),
        },
      },
    ],
  }
  assert.throws(() => parseAnalysisPayload(unknownPos, ['Bonjour.']), /无法识别的词性/)

  const wrongCount = {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            sentences: [
              {
                source: 'Salut.',
                tokens: [{ text: 'Salut', pos: 'interj.', lemma: 'salut', meaning: 'hi' }],
              },
            ],
          }),
        },
      },
    ],
  }
  assert.throws(() => parseAnalysisPayload(wrongCount, ['Bonjour.', 'Salut.']), /期望 2 句/)

  const reordered = {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            sentences: [
              {
                source: 'Salut.',
                translation: 'Hi!',
                tokens: [{ text: 'Salut', pos: 'interj.', lemma: 'salut', meaning: 'hi' }],
              },
              {
                source: 'Bonjour.',
                translation: 'Hello!',
                tokens: [{ text: 'Bonjour', pos: 'interj.', lemma: 'bonjour', meaning: 'hello' }],
              },
            ],
          }),
        },
      },
    ],
  }
  const aligned = parseAnalysisPayload(reordered, ['Bonjour.', 'Salut.'])
  assert.equal(aligned[0].tokens[0].text, 'Bonjour')
  assert.equal(aligned[0].translation, 'Hello!')
  assert.equal(aligned[1].tokens[0].text, 'Salut')
  assert.equal(aligned[1].translation, 'Hi!')
  assert.equal(aligned[0].tokens[0].respelling, '')
  assert.equal(aligned[0].tokens[0].ipa, '')
})

test('analyzeSentences sends a strict JSON Schema request and parses the result', async () => {
  const originalFetch = globalThis.fetch
  let capturedBody = null
  let capturedHeaders = null
  let capturedUrl = ''

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url)
    capturedBody = JSON.parse(String(init?.body))
    capturedHeaders = init?.headers
    return completionResponse()
  }

  try {
    const result = await analyzeSentences(
      {
        baseUrl: 'https://mock-primary.example/v1',
        apiKey: 'test-key',
        model: 'mock-model',
      },
      ['Bonjour.'],
    )

    assert.equal(capturedUrl, 'https://mock-primary.example/v1/chat/completions')
    assert.equal(capturedBody.response_format.type, 'json_schema')
    assert.equal(capturedBody.response_format.json_schema.strict, true)
    assert.equal(capturedBody.response_format.json_schema.name, 'french_sentence_analysis')

    const sentenceSchema =
      capturedBody.response_format.json_schema.schema.properties.sentences.items
    assert.deepEqual(sentenceSchema.required, ['source', 'translation', 'tokens'])
    assert.equal(sentenceSchema.properties.translation.type, 'string')

    const tokenSchema = sentenceSchema.properties.tokens.items
    assert.deepEqual(tokenSchema.required, [
      'text',
      'pos',
      'inflection',
      'lemma',
      'meaning',
      'respelling',
      'ipa',
    ])
    assert.equal(tokenSchema.properties.inflection.type, 'string')
    assert.equal(tokenSchema.properties.respelling.type, 'string')
    assert.equal(tokenSchema.properties.ipa.type, 'string')

    assert.equal(capturedHeaders.Authorization, 'Bearer test-key')
    assert.equal(result.usedCompatMode, false)
    assert.equal(result.sentences[0].translation, 'Hello!')
    assert.equal(result.sentences[0].tokens[0].inflection, '')
    assert.equal(result.sentences[0].tokens[0].text, 'Bonjour')
    assert.equal(result.sentences[0].tokens[0].respelling, 'bohn·zhoor')
    assert.equal(result.sentences[0].tokens[0].ipa, '/bɔ̃.ʒuʁ/')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('analyzeSentences retries with json_object after HTTP 400', async () => {
  const originalFetch = globalThis.fetch
  const bodies = []

  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    if (bodies.length === 1) {
      return errorResponse('response_format is not supported', 400)
    }
    return completionResponse()
  }

  try {
    const result = await analyzeSentences(
      {
        baseUrl: 'https://mock-fallback.example/v1',
        apiKey: '',
        model: 'compatible-model',
      },
      ['Bonjour.'],
    )

    assert.equal(bodies.length, 2)
    assert.equal(bodies[0].response_format.type, 'json_schema')
    assert.equal(bodies[1].response_format.type, 'json_object')
    assert.equal(result.usedCompatMode, true)
    assert.equal(result.sentences[0].translation, 'Hello!')
    assert.equal(result.sentences[0].tokens[0].meaning, 'hello')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('analyzeSentences maps HTTP auth errors and supports pre-abort', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => errorResponse('bad api key', 401)

  try {
    await assert.rejects(
      () =>
        analyzeSentences(
          {
            baseUrl: 'https://mock-auth.example/v1',
            apiKey: 'wrong',
            model: 'mock-model',
          },
          ['Bonjour.'],
        ),
      (error) => {
        assert.ok(error instanceof LlmError)
        assert.equal(error.kind, 'http')
        assert.equal(error.status, 401)
        assert.match(error.message, /API 密钥/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () =>
      analyzeSentences(
        {
          baseUrl: 'https://mock-abort.example/v1',
          apiKey: '',
          model: 'mock-model',
        },
        ['Bonjour.'],
        { signal: controller.signal },
      ),
    (error) => error instanceof LlmError && error.kind === 'aborted',
  )
})

test('translateToFrench sends a separate plain-text request with a naturalness prompt', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = ''
  let capturedBody
  let capturedHeaders

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url)
    capturedBody = JSON.parse(String(init?.body))
    capturedHeaders = init?.headers
    return completionResponse('```\nBonjour ! Comment vas-tu ?\n```')
  }

  try {
    const result = await translateToFrench(
      {
        baseUrl: 'https://mock-translate.example/v1',
        apiKey: 'translate-key',
        model: 'mock-model',
      },
      'Hello! How are you?',
    )

    assert.equal(capturedUrl, 'https://mock-translate.example/v1/chat/completions')
    assert.equal(capturedHeaders.Authorization, 'Bearer translate-key')
    assert.equal(capturedBody.messages.length, 2)
    assert.match(capturedBody.messages[0].content, /natural, idiomatic, contemporary French/)
    assert.equal(capturedBody.messages[1].content, 'Hello! How are you?')
    assert.equal('response_format' in capturedBody, false)
    assert.equal(result.translation, 'Bonjour ! Comment vas-tu ?')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('translateToFrench validates input and maps HTTP errors', async () => {
  await assert.rejects(
    () =>
      translateToFrench(
        {
          baseUrl: 'https://mock-translate.example/v1',
          apiKey: '',
          model: 'mock-model',
        },
        '   ',
      ),
    (error) => error instanceof LlmError && error.kind === 'config',
  )

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => errorResponse('bad api key', 401)

  try {
    await assert.rejects(
      () =>
        translateToFrench(
          {
            baseUrl: 'https://mock-translate.example/v1',
            apiKey: 'wrong',
            model: 'mock-model',
          },
          'Hello!',
        ),
      (error) => {
        assert.ok(error instanceof LlmError)
        assert.equal(error.kind, 'http')
        assert.equal(error.status, 401)
        assert.match(error.message, /API 密钥/)
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
