export type QoS = 'atmostonce' | 'atleastonce' | 'exactlyonce';

export type ButtonColor = 'orange' | 'green' | 'blue' | 'purple' | 'red' | 'teal';

export interface Button {
    id: string;
    name: string;
    topic: string;
    payload?: string;
    qos: QoS;
    retain: boolean;
    color?: ButtonColor;
    multiSendEnabled?: boolean;
    multiSendInterval?: number;
}

export interface Connection {
    id: string;
    name: string;
    broker_url: string;
    port: number;
    client_id: string;
    username?: string;
    password?: string;
    use_tls: boolean;
    auto_connect: boolean;
    variables: Record<string, string>;
    buttons: Button[];
    subscriptions: string[];
}

export interface AppData {
    connections: Connection[];
    last_connection_id?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Message {
    topic: string;
    payload: string;
    timestamp: number;
}
