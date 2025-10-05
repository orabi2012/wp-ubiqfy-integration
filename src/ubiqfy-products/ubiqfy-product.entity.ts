import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UbiqfyProductOption } from './ubiqfy-product-option.entity';
import { wpStoreProduct } from '../wp-stores/wp-store-products.entity';

// Mirror DB unique constraint added via migration 1730723000000
// Ensures TypeORM metadata knows about (product_code, is_sandbox) uniqueness
@Index('UQ_ubiqfy_products_code_env', ['product_code', 'is_sandbox'], { unique: true })
@Entity('ubiqfy_products')
export class UbiqfyProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  provider_code: string;

  @Column()
  product_code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  product_description: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ nullable: true })
  brand_logo_url: string;

  @Column({ nullable: true })
  terms_url: string;

  @Column({ nullable: true })
  privacy_url: string;

  @Column({ nullable: true })
  reedem_url: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  reedem_desc: string;

  @Column({ type: 'text', nullable: true })
  receipt_message: string;

  @Column({ default: 'DoTransaction' })
  next_method_call: string;

  @Column({ default: true })
  is_voucher: boolean;

  @Column({ default: false })
  is_transaction_cancelabled: boolean;

  @Column({ nullable: true })
  country_iso: string;

  @Column({ nullable: true })
  currency_code: string;

  @Column({ nullable: true })
  product_currency_code: string;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  discount: number;

  @Column({ nullable: true })
  product_url: string;

  @Column({ type: 'text', nullable: true })
  terms_conditions: string;

  // Environment flag (false = production, true = sandbox)
  // This allows storing two versions of the catalog simultaneously
  // to avoid sandbox data overwriting live data.
  @Column({ default: false })
  is_sandbox: boolean;

  // JSON fields for complex data
  @Column({ type: 'json', nullable: true })
  mandatory_fields: any;

  @Column({ type: 'json', nullable: true })
  visible_fields: any;

  // Relations
  @OneToMany(() => UbiqfyProductOption, (option) => option.product, {
    cascade: true,
  })
  options: UbiqfyProductOption[];

  @OneToMany(
    () => wpStoreProduct,
    (storeProduct) => storeProduct.ubiqfyProduct,
  )
  storeProducts: wpStoreProduct[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
