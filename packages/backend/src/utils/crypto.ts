import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Function to hash a password
export async function hashPassword(password: string): Promise<string> {
    const saltRounds = 10; // Adjust salt rounds as needed for security/performance balance
    return bcrypt.hash(password, saltRounds);
}

// Function to compare a password with a hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// Function to generate a secure random string (e.g., for session secrets, tokens)
export function generateSecureRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

// --- Added for WebAuthn ---

/**
 * Converts an ArrayBuffer or Buffer to a Base64URL-encoded string.
 * @param buffer The ArrayBuffer or Buffer to convert.
 * @returns The Base64URL-encoded string.
 */
export function bufferToBase64url(buffer: ArrayBuffer | Buffer): string {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return buf.toString('base64url');
}

/**
 * Converts a Base64URL-encoded string back to a Buffer.
 * @param base64urlString The Base64URL-encoded string.
 * @returns The corresponding Buffer.
 */
export function base64urlToBuffer(base64urlString: string): Buffer {
    // Pad the string if necessary, as base64url might omit padding
    // Node.js Buffer.from handles base64url directly
    return Buffer.from(base64urlString, 'base64url');
}
