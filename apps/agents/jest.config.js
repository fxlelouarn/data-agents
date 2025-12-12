module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.ts$',
    'proposal-application/',
    'auto-validator/integration'
  ],
  moduleNameMapper: {
    '^@data-agents/types$': '<rootDir>/../../packages/types/src',
    '^@data-agents/database$': '<rootDir>/../../packages/database/src',
    '^@data-agents/agent-framework$': '<rootDir>/../../packages/agent-framework/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
        resolveJsonModule: true,
        isolatedModules: true,
        strictNullChecks: false,
      }
    }]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageDirectory: '<rootDir>/coverage',
  testTimeout: 30000,
  maxWorkers: 1,
  verbose: true
};
