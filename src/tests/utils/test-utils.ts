import { expect,  } from 'vitest'

export function expectToHaveProps(object: Object, props: string[]) {
        expect(typeof object).toBe('object');
    for(let prop of props) {
        expect(object).toHaveProperty(prop);
    }
}

export function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));