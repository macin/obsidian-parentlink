module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['ts', 'js'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',
    moduleNameMapper: {
        '^obsidian$': '<rootDir>/__mocks__/obsidian.ts'
    },
    setupFiles: ['<rootDir>/jest.setup.js']
}; 