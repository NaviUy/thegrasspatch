// jest.config.cjs
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // load .env so DATABASE_URL, JWT_SECRET, etc. are available
  setupFiles: ['dotenv/config'],
  testMatch: ['**/__tests__/**/*.test.ts'],
}
