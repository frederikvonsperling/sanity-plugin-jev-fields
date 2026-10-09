/// <reference types="node" />
// Stages the current version on npm and tags it, for the release workflow.
//
// Releases use npm's staged publishing: the workflow runs `npm stage publish` (authenticated by
// trusted publishing), and the version only goes live once a maintainer approves it on
// npmjs.com or with `npm stage approve`, with 2FA. The npm CLI is used rather than
// `changeset publish` (which would run `pnpm publish`) because both features live there.
//
// This runs on every push to main. A staged version can't be listed from CI (that needs
// interactive login), so the GitHub tag marks a release as handled: once the tag exists,
// nothing is staged again. `changeset git-tag` reports the new tag in $CHANGESETS_OUTPUT, from
// which changesets/action pushes it and creates the GitHub release.
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

const manifest: {name: string; version: string} = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

const spec = `${manifest.name}@${manifest.version}`

// A single-package repo is tagged `v1.2.3`; check the package-scoped form too.
const tags = [`v${manifest.version}`, spec].map((tag) => `refs/tags/${tag}`)

const tagged = spawnSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', ...tags])

if (tagged.status === 0) {
  process.stdout.write(`${manifest.version} is already released.\n`)
  process.exit(0)
}

// A version published by hand (like the first release) is live already: just tag it.
const live = spawnSync('npm', ['view', spec, 'version'], {encoding: 'utf8'})

if (live.stdout.trim() === manifest.version) {
  process.stdout.write(`${spec} is already on npm.\n`)
} else {
  run('npm', ['stage', 'publish', '--access', 'public'])
  process.stdout.write(`${spec} is staged: approve it on npmjs.com to publish it.\n`)
}

run('pnpm', ['changeset', 'git-tag'])

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {stdio: 'inherit'})

  if (result.status !== 0) process.exit(result.status ?? 1)
}
