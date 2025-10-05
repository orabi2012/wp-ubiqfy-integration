import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UbiqfyProduct } from './ubiqfy-product.entity';

// Ensure each option code is unique per product. Sandbox flag mirrors parent product; uniqueness does
// not include is_sandbox because product_id already references the correct environment.
@Index('UQ_ubiqfy_product_options_pid_code', ['product_id', 'product_option_code'], { unique: true })
@Entity('ubiqfy_product_options')
export class UbiqfyProductOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  product_id: string;

  @Column()
  product_option_code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  ean_sku_upc: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  logo_url: string;

  // Face value range
  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  min_face_value: number;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  max_face_value: number;

  // Currency information from Ubiqfy API
  @Column({ type: 'varchar', length: 10, nullable: true })
  product_currency_code: string;

  // Selling price range (USD or base currency)
  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  min_value: number;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  max_value: number;

  // Wholesale price range
  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  min_wholesale_value: number;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  max_wholesale_value: number;

  // Relations
  @ManyToOne(() => UbiqfyProduct, (product) => product.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: UbiqfyProduct;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Mirrors environment of parent product for easier querying/indexing
  @Column({ default: false })
  is_sandbox: boolean;
}
