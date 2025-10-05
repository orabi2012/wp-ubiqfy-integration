import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { wpStore } from './wp-stores.entity';
import { UbiqfyProduct } from '../ubiqfy-products/ubiqfy-product.entity';
import { wpStoreProductOption } from './wp-store-product-option.entity';

@Entity('wp_store_products')
@Index(['wp_store_id', 'ubiqfy_product_id', 'is_sandbox'], { unique: true }) // Prevent duplicate entries per environment
export class wpStoreProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  wp_store_id: string;

  @Column()
  ubiqfy_product_id: string;

  // Relationship with wpStore
  @ManyToOne(() => wpStore, (store) => store.storeProducts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wp_store_id' })
  wpStore: wpStore;

  // Relationship with UbiqfyProduct
  @ManyToOne(() => UbiqfyProduct, (product) => product.storeProducts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ubiqfy_product_id' })
  ubiqfyProduct: UbiqfyProduct;

  // Store-specific product configuration
  @Column({ default: true })
  is_active: boolean;

  // Environment flag - mirrors the Ubiqfy product environment
  // Allows stores to have separate sandbox/production catalogs
  @Column({ default: false })
  is_sandbox: boolean;

  @Column({ nullable: true })
  wp_category_id: string; // Main Category ID in wp store

  @Column({ nullable: true })
  wp_country_subcategory_id: string; // Country Subcategory ID in wp store

  @Column({ type: 'json', nullable: true })
  sync_errors: any;

  // Relationship with product options
  @OneToMany(() => wpStoreProductOption, (option) => option.storeProduct)
  options: wpStoreProductOption[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
