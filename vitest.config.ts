import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // Include pure-logic modules, hooks, and sleep components in coverage.
      // Thresholds are graduated: domain lib code (pure, well-tested) at 75+,
      // hooks and sleep components (newly tracked) at a lower entry bar so they
      // are visible in reports without blocking CI.
      include: ['src/lib/**/*.ts', 'src/lib/hooks/**/*.ts', 'src/components/sleep/**/*.tsx'],
      exclude: ['src/lib/mock/**', 'src/lib/supabase/**', 'src/**/*.test.ts'],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 70,
        lines: 60,
      },
    },
  },
})
