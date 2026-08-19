/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/__mocks__/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    // Exclude infrastructure/CLI entry points that require real infrastructure
    '!src/server.ts',
    '!src/database/connection.ts',
    '!src/database/migrations/**',
    '!src/database/seed.ts',
    '!src/generator/cli.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
