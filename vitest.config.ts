import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // environment: 'node',
        include: ['./src/tests/**/*.test.ts'],
        // globals: true,
        // setupFiles: [],
        // coverage: {
        //     provider: 'v8',
        //     enabled: false,
        // },
    },
});