import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
    save: vi.fn(),
    open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeTextFile: vi.fn(),
    readTextFile: vi.fn(),
}));

import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { exportConnection, importConnection } from './api';
import type { Connection } from '../types';

const mockConnection: Connection = {
    id: 'test-uuid-123',
    name: 'Test Connection',
    broker_url: 'broker.example.com',
    port: 1883,
    client_id: 'test-client',
    use_tls: false,
    auto_connect: true,
    variables: { device_id: 'abc123' },
    buttons: [
        {
            id: 'btn-1',
            name: 'Test Button',
            topic: 'test/topic',
            payload: '{"test": true}',
            qos: 'atmostonce',
            retain: false,
            color: 'red',
        },
    ],
    subscriptions: ['test/#'],
};

describe('exportConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return false if user cancels save dialog', async () => {
        vi.mocked(save).mockResolvedValue(null);

        const result = await exportConnection(mockConnection);

        expect(result).toBe(false);
        expect(writeTextFile).not.toHaveBeenCalled();
    });

    it('should export connection without id field', async () => {
        vi.mocked(save).mockResolvedValue('/path/to/file.json');
        vi.mocked(writeTextFile).mockResolvedValue(undefined);

        const result = await exportConnection(mockConnection);

        expect(result).toBe(true);
        expect(save).toHaveBeenCalledWith({
            defaultPath: 'Test Connection.json',
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });

        const writeCall = vi.mocked(writeTextFile).mock.calls[0];
        expect(writeCall[0]).toBe('/path/to/file.json');

        const writtenData = JSON.parse(writeCall[1] as string);
        expect(writtenData).not.toHaveProperty('id');
        expect(writtenData.name).toBe('Test Connection');
        expect(writtenData.broker_url).toBe('broker.example.com');
        expect(writtenData.variables).toEqual({ device_id: 'abc123' });
        expect(writtenData.buttons).toHaveLength(1);
    });

    it('should use connection name as default filename', async () => {
        vi.mocked(save).mockResolvedValue('/path/to/file.json');
        vi.mocked(writeTextFile).mockResolvedValue(undefined);

        const connWithSpecialName = { ...mockConnection, name: 'My Special Connection' };
        await exportConnection(connWithSpecialName);

        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultPath: 'My Special Connection.json',
            })
        );
    });

    it('should format JSON with indentation', async () => {
        vi.mocked(save).mockResolvedValue('/path/to/file.json');
        vi.mocked(writeTextFile).mockResolvedValue(undefined);

        await exportConnection(mockConnection);

        const writeCall = vi.mocked(writeTextFile).mock.calls[0];
        const writtenContent = writeCall[1] as string;
        expect(writtenContent).toContain('\n');
        expect(writtenContent).toContain('  ');
    });
});

describe('importConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null if user cancels open dialog', async () => {
        vi.mocked(open).mockResolvedValue(null);

        const result = await importConnection();

        expect(result).toBeNull();
        expect(readTextFile).not.toHaveBeenCalled();
    });

    it('should return null if open returns non-string (multiple files)', async () => {
        vi.mocked(open).mockResolvedValue(['/file1.json', '/file2.json']);

        const result = await importConnection();

        expect(result).toBeNull();
    });

    it('should parse and return connection data', async () => {
        const connectionData = {
            name: 'Imported Connection',
            broker_url: 'imported.broker.com',
            port: 8883,
            client_id: 'imported-client',
            use_tls: true,
            auto_connect: false,
            variables: { key: 'value' },
            buttons: [],
            subscriptions: [],
        };

        vi.mocked(open).mockResolvedValue('/path/to/import.json');
        vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(connectionData));

        const result = await importConnection();

        expect(result).toEqual(connectionData);
        expect(open).toHaveBeenCalledWith({
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        expect(readTextFile).toHaveBeenCalledWith('/path/to/import.json');
    });

    it('should handle connection with all optional fields', async () => {
        const connectionData = {
            name: 'Full Connection',
            broker_url: 'broker.example.com',
            port: 1883,
            client_id: 'client-123',
            username: 'user',
            password: 'pass',
            use_tls: true,
            auto_connect: true,
            variables: { a: '1', b: '2' },
            buttons: [{ id: 'b1', name: 'Button', topic: 't', qos: 'atleastonce', retain: true, color: 'blue' }],
            subscriptions: ['topic/#'],
        };

        vi.mocked(open).mockResolvedValue('/path/to/import.json');
        vi.mocked(readTextFile).mockResolvedValue(JSON.stringify(connectionData));

        const result = await importConnection();

        expect(result).toEqual(connectionData);
        expect(result?.username).toBe('user');
        expect(result?.password).toBe('pass');
    });
});

describe('export/import roundtrip', () => {
    it('should preserve all data except id through export/import', async () => {
        let exportedContent = '';

        vi.mocked(save).mockResolvedValue('/path/to/file.json');
        vi.mocked(writeTextFile).mockImplementation(async (_path, content) => {
            exportedContent = content as string;
        });

        await exportConnection(mockConnection);

        vi.mocked(open).mockResolvedValue('/path/to/file.json');
        vi.mocked(readTextFile).mockResolvedValue(exportedContent);

        const imported = await importConnection();

        expect(imported).not.toHaveProperty('id');
        expect(imported?.name).toBe(mockConnection.name);
        expect(imported?.broker_url).toBe(mockConnection.broker_url);
        expect(imported?.port).toBe(mockConnection.port);
        expect(imported?.client_id).toBe(mockConnection.client_id);
        expect(imported?.use_tls).toBe(mockConnection.use_tls);
        expect(imported?.auto_connect).toBe(mockConnection.auto_connect);
        expect(imported?.variables).toEqual(mockConnection.variables);
        expect(imported?.buttons).toEqual(mockConnection.buttons);
        expect(imported?.subscriptions).toEqual(mockConnection.subscriptions);
    });
});
