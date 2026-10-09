import sanityPluginKitOxfmt from '@sanity/plugin-kit/oxfmt'
import {defineConfig} from 'oxfmt'

export default defineConfig({
  ...sanityPluginKitOxfmt,
  // Vendored, so it keeps upstream's formatting and can be diffed against it.
  ignorePatterns: [...(sanityPluginKitOxfmt.ignorePatterns ?? []), 'tools/oxlint/anti-slop/**'],
})
