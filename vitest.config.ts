import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts?(x)', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'lib'],
    globals: false,
  },
})
