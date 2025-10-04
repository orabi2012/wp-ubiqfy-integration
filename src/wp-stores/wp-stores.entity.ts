import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
  AfterLoad,
} from 'typeorm';
import { wpStoreProduct } from './wp-store-products.entity';

export enum SyncStatus {
  PENDING = 'pending',
  SYNCING = 'syncing',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('wp_stores')
export class wpStore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  wp_store_url: string;

  @Column({ unique: true })
  wp_store_name: string;

  @Column()
  wp_owner_name: string;

  @Column()
  wp_owner_email: string;

  @Column()
  wp_consumer_key: string;

  @Column()
  wp_consumer_secret: string;

  @Column({ nullable: true })
  wp_webhook_key: string; // Webhook secret key for signature verification

  @Column({ default: 'SAR', nullable: true })
  wp_currency: string; // Auto-fetched from wp API

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 3.75 })
  currency_conversion_rate: number; // Manual rate: 1 USD = X Store_Currency

  @Column({ default: 'USD' })
  ubiqfy_currency: string; // Ubiqfy's base currency

  // Ubiqfy Authentication Fields
  @Column()
  ubiqfy_username: string;

  @Column()
  ubiqfy_password: string;

  @Column()
  ubiqfy_terminal_key: string;

  @Column({ default: true })
  ubiqfy_sandbox: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ubiqfy_plafond: number;

  @Column({ type: 'timestamp', nullable: true })
  plafond_last_updated: Date;

  @Column({ default: 'Voucher' })
  ubiqfy_producttypecode: string;

  // SKU Configuration
  @Column({ default: 'UBQ', nullable: true })
  sku_prefix: string; // Customized prefix to add before SKU (e.g., 'UBQ-' + productCode)

  // System fields
  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_sync_at: Date;

  @Column({
    type: 'enum',
    enum: SyncStatus,
    default: SyncStatus.PENDING,
  })
  sync_status: SyncStatus;

  @Column({ default: 0 })
  total_products_synced: number;

  @Column({ type: 'text', nullable: true })
  last_error_message: string;

  // Relations
  @OneToMany(() => wpStoreProduct, (storeProduct) => storeProduct.wpStore)
  storeProducts: wpStoreProduct[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Temporary field to hold decrypted password (not persisted)
  private decryptedPassword?: string;

  // Temporary field to hold decrypted consumer secret (not persisted)
  private decryptedConsumerSecret?: string;

  @BeforeInsert()
  @BeforeUpdate()
  encryptPassword() {
    if (this.ubiqfy_password && !this.isPasswordEncrypted(this.ubiqfy_password)) {
      this.ubiqfy_password = this.encryptPasswordStatic(this.ubiqfy_password);
    }
  }

  @BeforeInsert()
  @BeforeUpdate()
  encryptConsumerSecret() {
    if (this.wp_consumer_secret && !this.isConsumerSecretEncrypted(this.wp_consumer_secret)) {
      this.wp_consumer_secret = this.encryptConsumerSecretStatic(this.wp_consumer_secret);
    }
  }

  @AfterLoad()
  decryptPassword() {
    if (this.ubiqfy_password && this.isPasswordEncrypted(this.ubiqfy_password)) {
      this.decryptedPassword = this.decryptPasswordStatic(this.ubiqfy_password);
    } else {
      this.decryptedPassword = this.ubiqfy_password;
    }
  }

  @AfterLoad()
  decryptConsumerSecret() {
    if (this.wp_consumer_secret && this.isConsumerSecretEncrypted(this.wp_consumer_secret)) {
      this.decryptedConsumerSecret = this.decryptConsumerSecretStatic(this.wp_consumer_secret);
    } else {
      this.decryptedConsumerSecret = this.wp_consumer_secret;
    }
  }

  /**
   * Get the decrypted password for API usage
   */
  getDecryptedPassword(): string {
    return this.decryptedPassword || this.ubiqfy_password;
  }

  /**
   * Get the decrypted consumer secret for API usage
   */
  getDecryptedConsumerSecret(): string {
    return this.decryptedConsumerSecret || this.wp_consumer_secret;
  }

  /**
   * Set a new password (will be encrypted on save)
   */
  setPassword(newPassword: string) {
    this.ubiqfy_password = newPassword;
    this.decryptedPassword = newPassword;
  }

  /**
   * Set a new consumer secret (will be encrypted on save)
   */
  setConsumerSecret(newSecret: string) {
    this.wp_consumer_secret = newSecret;
    this.decryptedConsumerSecret = newSecret;
  }

  // Static methods for encryption/decryption that work in entity hooks
  private encryptPasswordStatic(password: string): string {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const keyLength = 32;
    const ivLength = 16;

    if (!password || password.trim() === '') {
      throw new Error('Password cannot be empty');
    }

    try {
      const key = this.getEncryptionKeyStatic();
      const iv = crypto.randomBytes(ivLength);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      cipher.setAAD(Buffer.from('ubiqfy-password', 'utf8'));

      let encrypted = cipher.update(password, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const authTag = cipher.getAuthTag();

      return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
    } catch (error) {
      throw new Error(`Failed to encrypt password: ${error.message}`);
    }
  }

  private encryptConsumerSecretStatic(secret: string): string {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const keyLength = 32;
    const ivLength = 16;

    if (!secret || secret.trim() === '') {
      throw new Error('Consumer secret cannot be empty');
    }

    try {
      const key = this.getEncryptionKeyStatic();
      const iv = crypto.randomBytes(ivLength);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      cipher.setAAD(Buffer.from('wp-consumer-secret', 'utf8'));

      let encrypted = cipher.update(secret, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const authTag = cipher.getAuthTag();

      return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
    } catch (error) {
      throw new Error(`Failed to encrypt consumer secret: ${error.message}`);
    }
  }

  private decryptPasswordStatic(encryptedPassword: string): string {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';

    if (!encryptedPassword || encryptedPassword.trim() === '') {
      throw new Error('Encrypted password cannot be empty');
    }

    try {
      const parts = encryptedPassword.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted password format');
      }

      const [ivBase64, encryptedData, authTagBase64] = parts;
      const key = this.getEncryptionKeyStatic();
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAAD(Buffer.from('ubiqfy-password', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt password: ${error.message}`);
    }
  }

  private decryptConsumerSecretStatic(encryptedSecret: string): string {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';

    if (!encryptedSecret || encryptedSecret.trim() === '') {
      throw new Error('Encrypted consumer secret cannot be empty');
    }

    try {
      const parts = encryptedSecret.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted consumer secret format');
      }

      const [ivBase64, encryptedData, authTagBase64] = parts;
      const key = this.getEncryptionKeyStatic();
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAAD(Buffer.from('wp-consumer-secret', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt consumer secret: ${error.message}`);
    }
  }

  private isPasswordEncrypted(password: string): boolean {
    if (!password) return false;

    const parts = password.split(':');
    if (parts.length !== 3) return false;

    try {
      Buffer.from(parts[0], 'base64');
      Buffer.from(parts[2], 'base64');
      return true;
    } catch {
      return false;
    }
  }

  private isConsumerSecretEncrypted(secret: string): boolean {
    if (!secret) return false;

    const parts = secret.split(':');
    if (parts.length !== 3) return false;

    try {
      Buffer.from(parts[0], 'base64');
      Buffer.from(parts[2], 'base64');
      return true;
    } catch {
      return false;
    }
  }

  private getEncryptionKeyStatic(): Buffer {
    const crypto = require('crypto');
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }

    if (key.length < 32) {
      return crypto.pbkdf2Sync(key, 'ubiqfy-salt', 10000, 32, 'sha256');
    }

    return Buffer.from(key.slice(0, 32), 'utf8');
  }
}
