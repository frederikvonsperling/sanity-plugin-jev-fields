/// <reference types="node" />
// Publishes the current version to npm and tags it, for the release workflow.
//
// Uses the npm CLI rather than `changeset publish` (which would run `pnpm publish`): npm's
// trusted publishing is implemented in the npm CLI. Runs on every push to main, so it skips a
// version that is already on npm, and only tags a release whose tag isn't on GitHub yet.
// `changeset git-tag` reports new tags in $CHANGESETS_OUTPUT, from which changesets/action
// pushes the tag and creates the GitHub release.
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

const manifest: {name: string; version: string} = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)
const spec = `${manifest.name}@${manifest.version}`

const onNpm = spawnSync('npm', ['view', spec, 'version'], {encoding: 'utf8'})
if (onNpm.stdout.trim() === manifest.version) {
  process.stdout.write(`${spec} is already on npm.\n`)
} else {
  run('npm', ['publish', '--access', 'public'])
}

// A single-package repo is tagged `v1.2.3`; check the package-scoped form too.
const tags = [`v${manifest.version}`, spec].map((tag) => `refs/tags/${tag}`)
const tagged = spawnSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', ...tags])
if (tagged.status === 0) {
  process.stdout.write(`${manifest.version} is already tagged on GitHub.\n`)
} else {
  run('pnpm', ['changeset', 'git-tag'])
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {stdio: 'inherit'})
  if (result.status !== 0) process.exit(result.status ?? 1)
}
