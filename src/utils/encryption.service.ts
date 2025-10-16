import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

@Injectable()
export class EncryptionService {
    private readonly logger = new Logger(EncryptionService.name);
    private readonly key: Buffer;
    private readonly prefix = 'enc:';

    constructor(private readonly configService: ConfigService) {
        const rawKey = this.configService.get<string>('ENCRYPTION_KEY');
        if (!rawKey) {
            throw new InternalServerErrorException('Encryption key is not configured. Set ENCRYPTION_KEY.');
        }

        this.key = this.buildKey(rawKey.trim());
        if (this.key.length !== 32) {
            throw new InternalServerErrorException('Encryption key must resolve to 32 bytes after decoding/derivation');
        }
    }

    encrypt(value: string | null | undefined): string | null {
        if (!value) {
            return value ?? null;
        }

        if (this.isEncrypted(value)) {
            return value;
        }

        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const payload = Buffer.concat([iv, authTag, encrypted]);
        return `${this.prefix}${payload.toString('base64')}`;
    }

    decrypt(value: string | null | undefined): string | null {
        if (!value) {
            return value ?? null;
        }

        if (!this.isEncrypted(value)) {
            return value;
        }

        try {
            const payload = Buffer.from(value.slice(this.prefix.length), 'base64');
            const iv = payload.subarray(0, 12);
            const authTag = payload.subarray(12, 28);
            const encrypted = payload.subarray(28);

            const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return decrypted.toString('utf8');
        } catch (error) {
            this.logger.error('Failed to decrypt value', error as Error);
            return null;
        }
    }

    encryptJson(value: unknown): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        try {
            return this.encrypt(JSON.stringify(value));
        } catch (error) {
            this.logger.error('Failed to encrypt JSON value', error as Error);
            return null;
        }
    }

    decryptJson<T = unknown>(value: string | null | undefined): T | null {
        const decrypted = this.decrypt(value);
        if (!decrypted) {
            return null;
        }

        try {
            return JSON.parse(decrypted) as T;
        } catch (error) {
            this.logger.warn('Failed to parse decrypted JSON value');
            return null;
        }
    }

    isEncrypted(value: string | null | undefined): boolean {
        return typeof value === 'string' && value.startsWith(this.prefix);
    }

    getEncryptedPrefix(): string {
        return this.prefix;
    }

    private buildKey(source: string): Buffer {
        const trimmed = source.trim();

        // Try base64
        try {
            const base64 = Buffer.from(trimmed, 'base64');
            if (base64.length === 32) {
                return base64;
            }
        } catch {
            /* ignore */
        }

        // Try hex
        if (/^[0-9a-fA-F]+$/.test(trimmed)) {
            const hex = Buffer.from(trimmed, 'hex');
            if (hex.length === 32) {
                return hex;
            }
        }

        // Fallback: derive key using SHA-256 hash
        return createHash('sha256').update(trimmed, 'utf8').digest();
    }
}
