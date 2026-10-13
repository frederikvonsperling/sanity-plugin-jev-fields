/// <reference types="node" />
// Writes a changeset for a Dependabot PR that changes the plugin's runtime `dependencies`, for
// the dependabot-changeset workflow.
//
// Only `dependencies` reach npm users: dev dependencies and lockfile-only updates ship without
// a changeset, as AGENTS.md says. The changeset is a patch, worded for the CHANGELOG; edit it in
// the PR when an update deserves more.
//
// Reads BASE_SHA (the PR's base commit) and PULL_REQUEST_NUMBER, and reports `written=true` in
// $GITHUB_OUTPUT when it writes a changeset.
import {execFileSync} from 'node:child_process'
import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs'

type Manifest = {name: string; dependencies?: Record<string, string>}

const baseSha = requireEnvironmentVariable('BASE_SHA')

const pullRequestNumber = requireEnvironmentVariable('PULL_REQUEST_NUMBER')

const changesetPath = `.changeset/dependabot-${pullRequestNumber}.md`

if (existsSync(changesetPath)) {
  process.stdout.write(`${changesetPath} already exists.\n`)
  process.exit(0)
}

const forkPoint = git('merge-base', baseSha, 'HEAD').trim()

const manifestBefore: Manifest = JSON.parse(git('show', `${forkPoint}:package.json`))

const manifestAfter: Manifest = JSON.parse(readFileSync('package.json', 'utf8'))

const rangesBefore = manifestBefore.dependencies ?? {}

const rangesAfter = manifestAfter.dependencies ?? {}

const changedDependencies = Object.keys(rangesAfter).filter(
  (dependencyName) => rangesBefore[dependencyName] !== rangesAfter[dependencyName],
)

if (changedDependencies.length === 0) {
  process.stdout.write('No runtime dependency ranges changed: no changeset needed.\n')
  process.exit(0)
}

const updateDescriptions = changedDependencies.map((dependencyName) =>
  describeUpdate(dependencyName, rangesBefore[dependencyName], rangesAfter[dependencyName]),
)

const changeset = `---
'${manifestAfter.name}': patch
---

Updates ${joinAsSentence(updateDescriptions)}.
`

writeFileSync(changesetPath, changeset)

process.stdout.write(`Wrote ${changesetPath}:\n\n${changeset}`)

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'written=true\n')

function describeUpdate(
  dependencyName: string,
  rangeBefore: string | undefined,
  rangeAfter: string,
) {
  if (rangeBefore === undefined) return `\`${dependencyName}\` to ${rangeAfter}`

  return `\`${dependencyName}\` from ${rangeBefore} to ${rangeAfter}`
}

function joinAsSentence(parts: string[]) {
  if (parts.length === 1) return parts[0]

  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

function git(...args: string[]) {
  return execFileSync('git', args, {encoding: 'utf8'})
}

function requireEnvironmentVariable(name: string) {
  const value = process.env[name]

  if (!value) {
    process.stderr.write(`${name} is not set.\n`)
    process.exit(1)
  }

  return value
}
