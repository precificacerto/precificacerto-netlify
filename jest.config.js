const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Fora do app Next: framework AIOS (.aios-core/, .cursor/) e cópia legada (web-app/)
  // trazem suítes próprias que não pertencem a esta aplicação e quebram o run de CI.
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.aios-core/',
    '<rootDir>/.cursor/',
    '<rootDir>/web-app/',
  ],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Alinha `@/*` (tsconfig path) à resolução de `jest.mock(...)`,
    // que não passa pelo babel/swc do next/jest.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
