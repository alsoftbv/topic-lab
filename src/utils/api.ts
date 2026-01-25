import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import type { AppData, Connection, Button, QoS, Message } from '../types';
import { substituteVariables } from './variables';

export async function getData(): Promise<AppData> {
    return invoke<AppData>('get_data');
}

export async function saveData(data: AppData): Promise<void> {
    return invoke('save_data', { data });
}

export async function deleteData(): Promise<void> {
    return invoke('delete_data');
}

export async function connect(connection: Connection): Promise<void> {
    return invoke('connect', { connection });
}

export async function disconnect(): Promise<void> {
    return invoke('disconnect');
}

export async function publish(topic: string, payload: string, qos: QoS, retain: boolean): Promise<void> {
    return invoke('publish', { topic, payload, qos, retain });
}

export async function publishButton(button: Button, variables: Record<string, string>): Promise<void> {
    const topic = substituteVariables(button.topic, variables);
    const payload = button.payload ? substituteVariables(button.payload, variables) : '';
    return publish(topic, payload, button.qos, button.retain);
}

export async function subscribe(topic: string, qos: QoS): Promise<void> {
    return invoke('subscribe', { topic, qos });
}

export async function unsubscribe(topic: string): Promise<void> {
    return invoke('unsubscribe', { topic });
}

export async function getMessages(): Promise<Message[]> {
    return invoke<Message[]>('get_messages');
}

export async function clearMessages(): Promise<void> {
    return invoke('clear_messages');
}

export async function getSubscriptions(): Promise<string[]> {
    return invoke<string[]>('get_subscriptions');
}

export async function exportConnection(connection: Connection): Promise<boolean> {
    const filePath = await save({
        defaultPath: `${connection.name}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (!filePath) return false;

    const { id, ...exportData } = connection;
    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    return true;
}

export async function importConnection(): Promise<Omit<Connection, 'id'> | null> {
    const filePath = await open({
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (!filePath || typeof filePath !== 'string') return null;

    const content = await readTextFile(filePath);
    return JSON.parse(content);
}
