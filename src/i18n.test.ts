/// <reference types="node" />
import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'

import {resources} from './i18n'

const SOURCE = new URL('.', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name.startsWith('__') ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

describe('translations', () => {
  const code = sourceFiles(SOURCE).map((file) => readFileSync(file, 'utf8'))
  const used: string[] = []
  for (const text of code) {
    for (const match of text.matchAll(/\bt\('([\w.-]+)'|i18nKey="([\w.-]+)"/g)) {
      used.push(match[1] ?? match[2])
    }
  }

  it('has an English text for every key the code uses', () => {
    expect(used.length).toBeGreaterThan(30)
    expect(used.filter((key) => !(key in resources))).toEqual([])
  })

  it('has every noul level the badge can show', () => {
    for (const level of ['low', 'medium', 'high'])
      expect(resources).toHaveProperty(`noul.level.${level}`)
  })

  it('has no texts the code never uses', () => {
    const dynamic = (key: string) => key.startsWith('noul.level.')
    expect(Object.keys(resources).filter((key) => !used.includes(key) && !dynamic(key))).toEqual([])
  })
})
