

export interface ConnectionBase {
    id: number;
    name: string | null;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    proxy_id: number | null;
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}

export interface ConnectionWithTags extends ConnectionBase {
    tag_ids: number[];
}


export interface CreateConnectionInput {
    name?: string; 
    host: string;
    port?: number;
    username: string;
    auth_method: 'password' | 'key';
    password?: string; 
    private_key?: string; 
    passphrase?: string; 
    proxy_id?: number | null;
    tag_ids?: number[];
}


export interface UpdateConnectionInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    auth_method?: 'password' | 'key';
    password?: string;
    private_key?: string;
    passphrase?: string; 
    proxy_id?: number | null;
    tag_ids?: number[];
}


export interface FullConnectionData {
    id: number;
    name: string | null;
    host: string;
    port: number;
    username: string;
    auth_method: 'password' | 'key';
    encrypted_password: string | null;
    encrypted_private_key: string | null;
    encrypted_passphrase: string | null;
    proxy_id: number | null;
    created_at: number;
    updated_at: number;
    last_connected_at: number | null;
}