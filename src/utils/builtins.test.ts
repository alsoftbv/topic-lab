import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    isBuiltinVariable,
    getBuiltinNames,
    resolveBuiltin,
    parseVariableExpression,
} from './builtins';

describe('isBuiltinVariable', () => {
    it('should return true for now', () => {
        expect(isBuiltinVariable('now')).toBe(true);
    });

    it('should return true for timestamp', () => {
        expect(isBuiltinVariable('timestamp')).toBe(true);
    });

    it('should return true for uuid', () => {
        expect(isBuiltinVariable('uuid')).toBe(true);
    });

    it('should return true for random', () => {
        expect(isBuiltinVariable('random')).toBe(true);
    });

    it('should return true for rand', () => {
        expect(isBuiltinVariable('rand')).toBe(true);
    });

    it('should return false for non-builtins', () => {
        expect(isBuiltinVariable('device_id')).toBe(false);
        expect(isBuiltinVariable('custom')).toBe(false);
        expect(isBuiltinVariable('')).toBe(false);
    });
});

describe('getBuiltinNames', () => {
    it('should return all builtin names', () => {
        const names = getBuiltinNames();
        expect(names).toContain('now');
        expect(names).toContain('timestamp');
        expect(names).toContain('uuid');
        expect(names).toContain('random');
        expect(names).toContain('rand');
    });
});

describe('parseVariableExpression', () => {
    it('should parse simple variable name', () => {
        const result = parseVariableExpression('now');
        expect(result.name).toBe('now');
        expect(result.modifiers).toEqual([]);
    });

    it('should parse variable with one modifier', () => {
        const result = parseVariableExpression('now:utc');
        expect(result.name).toBe('now');
        expect(result.modifiers).toEqual(['utc']);
    });

    it('should parse variable with multiple modifiers', () => {
        const result = parseVariableExpression('now:utc:-1h:unix');
        expect(result.name).toBe('now');
        expect(result.modifiers).toEqual(['utc', '-1h', 'unix']);
    });

    it('should handle custom format modifier', () => {
        const result = parseVariableExpression('now:fmt:YYYY-MM-DD');
        expect(result.name).toBe('now');
        expect(result.modifiers).toEqual(['fmt', 'YYYY-MM-DD']);
    });

    it('should handle random with range', () => {
        const result = parseVariableExpression('random:1-100');
        expect(result.name).toBe('random');
        expect(result.modifiers).toEqual(['1-100']);
    });
});

describe('resolveBuiltin', () => {
    describe('uuid', () => {
        it('should generate a valid UUID format', () => {
            const result = resolveBuiltin('uuid');
            expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('should generate unique UUIDs', () => {
            const uuid1 = resolveBuiltin('uuid');
            const uuid2 = resolveBuiltin('uuid');
            expect(uuid1).not.toBe(uuid2);
        });
    });

    describe('random', () => {
        it('should generate a number in default range 0-100', () => {
            for (let i = 0; i < 20; i++) {
                const result = parseInt(resolveBuiltin('random')!);
                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(100);
            }
        });

        it('should generate a number in specified range', () => {
            for (let i = 0; i < 20; i++) {
                const result = parseInt(resolveBuiltin('random', ['1-10'])!);
                expect(result).toBeGreaterThanOrEqual(1);
                expect(result).toBeLessThanOrEqual(10);
            }
        });

        it('should handle rand alias', () => {
            const result = resolveBuiltin('rand');
            expect(result).not.toBeNull();
            const num = parseInt(result!);
            expect(num).toBeGreaterThanOrEqual(0);
            expect(num).toBeLessThanOrEqual(100);
        });
    });

    describe('now/timestamp', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2024-06-15T10:30:45.123Z'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should return ISO format by default', () => {
            const result = resolveBuiltin('now');
            expect(result).toContain('2024-06-15');
            expect(result).toContain('10:30:45');
        });

        it('should handle timestamp alias', () => {
            const result = resolveBuiltin('timestamp');
            expect(result).toContain('2024-06-15');
        });

        it('should return UTC ISO format with utc modifier', () => {
            const result = resolveBuiltin('now', ['utc']);
            expect(result).toBe('2024-06-15T10:30:45.123Z');
        });

        it('should return unix timestamp', () => {
            const result = resolveBuiltin('now', ['unix']);
            expect(result).toMatch(/^\d{10}$/);
            const timestamp = parseInt(result!);
            expect(timestamp).toBeGreaterThan(1700000000);
            expect(timestamp).toBeLessThan(1800000000);
        });

        it('should return unix timestamp in milliseconds', () => {
            const result = resolveBuiltin('now', ['unixms']);
            expect(result).toMatch(/^\d{13}$/);
            const timestamp = parseInt(result!);
            expect(timestamp).toBeGreaterThan(1700000000000);
            expect(timestamp).toBeLessThan(1800000000000);
        });

        it('should return date only', () => {
            const result = resolveBuiltin('now', ['utc', 'date']);
            expect(result).toBe('2024-06-15');
        });

        it('should return time only', () => {
            const result = resolveBuiltin('now', ['utc', 'time']);
            expect(result).toBe('10:30:45');
        });

        it('should return datetime format', () => {
            const result = resolveBuiltin('now', ['utc', 'datetime']);
            expect(result).toBe('2024-06-15 10:30:45');
        });

        it('should apply positive hour offset', () => {
            const result = resolveBuiltin('now', ['utc', '+2h', 'datetime']);
            expect(result).toBe('2024-06-15 12:30:45');
        });

        it('should apply negative hour offset', () => {
            const result = resolveBuiltin('now', ['utc', '-1h', 'datetime']);
            expect(result).toBe('2024-06-15 09:30:45');
        });

        it('should apply minute offset', () => {
            const result = resolveBuiltin('now', ['utc', '+30m', 'datetime']);
            expect(result).toBe('2024-06-15 11:00:45');
        });

        it('should apply day offset', () => {
            const result = resolveBuiltin('now', ['utc', '-1d', 'date']);
            expect(result).toBe('2024-06-14');
        });

        it('should apply week offset', () => {
            const result = resolveBuiltin('now', ['utc', '+1w', 'date']);
            expect(result).toBe('2024-06-22');
        });

        it('should apply month offset', () => {
            const result = resolveBuiltin('now', ['utc', '-1M', 'date']);
            expect(result).toBe('2024-05-15');
        });

        it('should apply year offset', () => {
            const result = resolveBuiltin('now', ['utc', '+1y', 'date']);
            expect(result).toBe('2025-06-15');
        });

        it('should handle custom format', () => {
            const result = resolveBuiltin('now', ['utc', 'fmt:YYYY/MM/DD']);
            expect(result).toBe('2024/06/15');
        });

        it('should handle custom format with time', () => {
            const result = resolveBuiltin('now', ['utc', 'fmt:YYYY-MM-DD HH:mm:ss']);
            expect(result).toBe('2024-06-15 10:30:45');
        });

        it('should handle custom format with milliseconds', () => {
            const result = resolveBuiltin('now', ['utc', 'fmt:HH:mm:ss.SSS']);
            expect(result).toBe('10:30:45.123');
        });

        it('should combine offset with format', () => {
            const result = resolveBuiltin('now', ['utc', '-1h', 'fmt:HH:mm']);
            expect(result).toBe('09:30');
        });
    });

    describe('non-builtin', () => {
        it('should return null for unknown variables', () => {
            expect(resolveBuiltin('device_id')).toBeNull();
            expect(resolveBuiltin('unknown')).toBeNull();
        });
    });
});
