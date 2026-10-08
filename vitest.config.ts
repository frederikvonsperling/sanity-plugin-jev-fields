import {defineConfig} from 'vitest/config'

// tsconfig keeps `jsx: preserve` for the build; tests need the JSX compiled.
export default defineConfig({oxc: {jsx: {runtime: 'automatic'}}})
