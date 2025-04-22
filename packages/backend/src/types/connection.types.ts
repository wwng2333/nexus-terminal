// Centralized types for Connection feature

export interface ConnectionBase {
    id: number;
    name: string | null; // Allow name to be null
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

// Input type for creating a connection (from controller)
export interface CreateConnectionInput {
    name?: string; // Name is now optional
    host: string;
    port?: number; // Optional, defaults in service/repo
    username: string;
    auth_method: 'password' | 'key';
    password?: string; // Optional depending on auth_method
    private_key?: string; // Optional depending on auth_method
    passphrase?: string; // Optional for key auth
    proxy_id?: number | null;
    tag_ids?: number[];
}

// Input type for updating a connection (from controller)
// All fields are optional except potentially auth_method related ones
export interface UpdateConnectionInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    auth_method?: 'password' | 'key';
    password?: string;
    private_key?: string;
    passphrase?: string; // Use undefined to signal no change, null/empty string to clear
    proxy_id?: number | null;
    tag_ids?: number[];
}

// Type used within the repository (includes encrypted fields)
// This might stay in the repository or be defined here if needed elsewhere
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