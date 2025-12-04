module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@data-agents/types$': '<rootDir>/packages/types/src',
    '^@data-agents/database$': '<rootDir>/packages/database/src',
    '^@data-agents/agent-framework$': '<rootDir>/packages/agent-framework/src',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react',
        strictNullChecks: false,
      }
    }]
  },
  collectCoverageFrom: [
    'packages/database/src/services/proposal-domain.service.ts',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000,
  maxWorkers: 1, // Important pour les tests DB
  bail: false,
  verbose: true
};
