import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts?(x)', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'lib'],
    globals: false,
    // Brackets the whole run: fails the suite if any test changed the real
    // ~/.kiro kiro-cli directory — see tests/home-guard.ts.
    globalSetup: ['tests/home-guard.ts'],
  },
})
