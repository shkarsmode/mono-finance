/**
 * Plain ts-jest — no Angular TestBed. These specs cover the pure logic where the
 * silent bugs actually lived (category totalling, money math, sorting), so they stay
 * fast and need no browser. Angular ships ESM, so its packages are transformed too.
 */
module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.spec.ts'],
    moduleNameMapper: {
        '^@core/(.*)$': '<rootDir>/src/app/core/$1',
        '^@shared/(.*)$': '<rootDir>/src/app/shared/$1',
    },
    transform: {
        '^.+\.(ts|mjs|js)$': ['ts-jest', {
            tsconfig: {
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                target: 'ES2022',
                module: 'CommonJS',
                moduleResolution: 'node',
                esModuleInterop: true,
                allowJs: true,
                skipLibCheck: true,
            },
        }],
    },
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@angular|rxjs|tslib)/)'],
};
