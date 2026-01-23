import { describe, it, expect } from 'vitest';
import { substituteVariables, extractVariableNames, getMissingVariables } from './variables';

describe('substituteVariables', () => {
    it('should substitute a single variable', () => {
        const result = substituteVariables('devices/{device_id}/CMD', { device_id: 'abc123' });
        expect(result).toBe('devices/abc123/CMD');
    });

    it('should substitute multiple different variables', () => {
        const result = substituteVariables('devices/{device_id}/sensors/{sensor}/value', {
            device_id: 'abc123',
            sensor: 'temp',
        });
        expect(result).toBe('devices/abc123/sensors/temp/value');
    });

    it('should substitute the same variable multiple times', () => {
        const result = substituteVariables('{id}/request/{id}/response', { id: '123' });
        expect(result).toBe('123/request/123/response');
    });

    it('should keep placeholder for missing variables', () => {
        const result = substituteVariables('devices/{device_id}/CMD', {});
        expect(result).toBe('devices/{device_id}/CMD');
    });

    it('should substitute found variables and keep missing ones', () => {
        const result = substituteVariables('devices/{device_id}/{missing}/CMD', {
            device_id: 'abc123',
        });
        expect(result).toBe('devices/abc123/{missing}/CMD');
    });

    it('should return unchanged string with no variables', () => {
        const result = substituteVariables('devices/static/topic', { test: 'value' });
        expect(result).toBe('devices/static/topic');
    });

    it('should handle empty template', () => {
        const result = substituteVariables('', { test: 'value' });
        expect(result).toBe('');
    });

    it('should handle variables with underscores', () => {
        const result = substituteVariables('devices/{device_type_id}/data', {
            device_type_id: 'sensor_01',
        });
        expect(result).toBe('devices/sensor_01/data');
    });

    it('should not substitute invalid variable names', () => {
        const result = substituteVariables('{123invalid}/{valid_name}', {
            '123invalid': 'bad',
            valid_name: 'good',
        });
        expect(result).toBe('{123invalid}/good');
    });
});

describe('extractVariableNames', () => {
    it('should extract variable names from template', () => {
        const names = extractVariableNames('devices/{device_id}/sensors/{sensor_type}/value');
        expect(names).toEqual(['device_id', 'sensor_type']);
    });

    it('should return empty array for no variables', () => {
        const names = extractVariableNames('devices/static/topic');
        expect(names).toEqual([]);
    });

    it('should include duplicate variable names', () => {
        const names = extractVariableNames('{id}/request/{id}/response');
        expect(names).toEqual(['id', 'id']);
    });

    it('should handle empty template', () => {
        const names = extractVariableNames('');
        expect(names).toEqual([]);
    });
});

describe('getMissingVariables', () => {
    it('should return missing variables', () => {
        const missing = getMissingVariables('devices/{device_id}/{sensor}/CMD', {
            device_id: 'abc123',
        });
        expect(missing).toEqual(['sensor']);
    });

    it('should return empty array when all variables are present', () => {
        const missing = getMissingVariables('devices/{device_id}/CMD', {
            device_id: 'abc123',
        });
        expect(missing).toEqual([]);
    });

    it('should return all variables when none are present', () => {
        const missing = getMissingVariables('devices/{device_id}/{sensor}/CMD', {});
        expect(missing).toEqual(['device_id', 'sensor']);
    });

    it('should return empty array for template with no variables', () => {
        const missing = getMissingVariables('devices/static/topic', {});
        expect(missing).toEqual([]);
    });
});

describe('substituteVariables with MQTT wildcards', () => {
    it('should preserve + single-level wildcard', () => {
        const result = substituteVariables('devices/{device_id}/+/status', {
            device_id: 'abc123',
        });
        expect(result).toBe('devices/abc123/+/status');
    });

    it('should preserve # multi-level wildcard', () => {
        const result = substituteVariables('devices/{device_id}/#', {
            device_id: 'abc123',
        });
        expect(result).toBe('devices/abc123/#');
    });

    it('should handle wildcards at the start', () => {
        const result = substituteVariables('+/{device_id}/status', {
            device_id: 'abc123',
        });
        expect(result).toBe('+/abc123/status');
    });

    it('should handle multiple wildcards with variables', () => {
        const result = substituteVariables('s/{mac}/+', { mac: 'AA:BB:CC' });
        expect(result).toBe('s/AA:BB:CC/+');
    });

    it('should work with topic that is only a wildcard', () => {
        const result = substituteVariables('#', {});
        expect(result).toBe('#');
    });

    it('should handle complex topic with multiple variables and wildcards', () => {
        const result = substituteVariables('{prefix}/devices/{device_id}/+/sensors/#', {
            prefix: 'home',
            device_id: 'living-room',
        });
        expect(result).toBe('home/devices/living-room/+/sensors/#');
    });
});

describe('edge cases', () => {
    it('should handle curly braces that are not variables', () => {
        const result = substituteVariables('topic/{valid}/data', { valid: 'test' });
        expect(result).toBe('topic/test/data');
    });

    it('should not substitute partial matches', () => {
        const result = substituteVariables('{device_id_extended}', { device_id: 'abc' });
        expect(result).toBe('{device_id_extended}');
    });

    it('should handle variables at start and end', () => {
        const result = substituteVariables('{start}/middle/{end}', {
            start: 'A',
            end: 'Z',
        });
        expect(result).toBe('A/middle/Z');
    });

    it('should handle adjacent variables', () => {
        const result = substituteVariables('{a}{b}{c}', { a: '1', b: '2', c: '3' });
        expect(result).toBe('123');
    });

    it('should handle variable values with special characters', () => {
        const result = substituteVariables('devices/{id}/data', { id: 'device-01_test' });
        expect(result).toBe('devices/device-01_test/data');
    });

    it('should handle empty variable value', () => {
        const result = substituteVariables('devices/{id}/data', { id: '' });
        expect(result).toBe('devices//data');
    });
});
