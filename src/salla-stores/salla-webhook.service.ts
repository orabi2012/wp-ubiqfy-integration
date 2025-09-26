import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { wpStore, SyncStatus } from './wp-stores.entity';
import { wpStoreProduct } from './wp-store-products.entity';
import { wpStoreProductOption } from './wp-store-product-option.entity';
import { wpWebhookManagementService } from './wp-webhook-management.service';

export interface wpAppInstallationWebhook {
    event: string;
    merchant: number;
    created_at: string;
    data: {
        id: number;
        app_name: string;
        app_description: string;
        app_type: string;
        app_scopes: string[];
        installation_date: string;
        store_type: string;
        // Optional fields that might come in different events
        access_token?: string;
        expires?: number;
        refresh_token?: string;
        scope?: string;
        token_type?: string;
    };
}

export interface wpStoreAuthorizationWebhook {
    event: string;
    merchant: number;
    created_at: string;
    data: {
        id: number;
        app_name: string;
        access_token: string;
        expires: number;
        refresh_token: string;
        scope: string;
        token_type: string;
    };
}

export interface wpAppUninstallationWebhook {
    event: string;
    merchant: number;
    created_at: string;
    data: {
        id: number;
        app_name: string;
        app_description: string;
        app_type: string;
        uninstallation_date: string;
        reason?: string;
    };
}

@Injectable()
export class wpWebhookService {
    private readonly logger = new Logger(wpWebhookService.name);

    constructor(
        @InjectRepository(wpStore)
        private readonly wpStoreRepository: Repository<wpStore>,
        @InjectRepository(wpStoreProduct)
        private readonly storeProductRepository: Repository<wpStoreProduct>,
        @InjectRepository(wpStoreProductOption)
        private readonly storeProductOptionRepository: Repository<wpStoreProductOption>,
        private readonly webhookManagementService: wpWebhookManagementService,
    ) { }

    /**
     * Process incoming wp webhook
     */
    async processWebhook(payload: any): Promise<any> {
        const { event, merchant, data } = payload;

        this.logger.log(`🎯 Processing webhook event: ${event} for merchant: ${merchant}`);

        // Handle app installation separately (no existing store needed)
        if (event === 'app.installed') {
            return await this.handleAppInstalled(payload);
        }

        // Handle app store authorization (contains tokens)
        if (event === 'app.store.authorize') {
            return await this.handleStoreAuthorization(payload);
        }

        // Handle app uninstallation
        if (event === 'app.uninstalled') {
            return await this.handleAppUninstalled(payload);
        }

        // Find the store by wp merchant ID for other events
        const store = await this.wpStoreRepository.findOne({
            where: { wp_store_id: merchant.toString() }
        });

        if (!store) {
            this.logger.warn(`⚠️  Store not found for merchant ID: ${merchant}`);
            throw new HttpException(`Store not found for merchant ID: ${merchant}`, HttpStatus.NOT_FOUND);
        }

        // Process different webhook events
        switch (event) {
            // Product events
            case 'product.deleted':
                return await this.handleProductDeleted(store, data);

            default:
                this.logger.log(`ℹ️  Unhandled webhook event: ${event}`);
                return { message: `Event ${event} logged but not processed` };
        }
    }

    /**
     * Handle product deleted event
     * Removes the product from our wp_store_products table
     */
    private async handleProductDeleted(store: wpStore, productData: any): Promise<any> {
        this.logger.log(`🗑️  Product deleted in wp: ${productData.name} (SKU: ${productData.sku})`);
        this.logger.log(`🔍 DEBUG: Looking for product with wp ID: ${productData.id} (type: ${typeof productData.id})`);

        try {
            // Find options that match this wp product ID since products are now stored at option level
            const storeProductOptions = await this.storeProductOptionRepository.find({
                where: {
                    wp_product_id: productData.id.toString()
                },
                relations: ['storeProduct', 'storeProduct.ubiqfyProduct']
            });

            this.logger.log(`🔍 DEBUG: Found ${storeProductOptions.length} options with wp_product_id = '${productData.id.toString()}'`);

            if (storeProductOptions && storeProductOptions.length > 0) {
                // Delete all matching options from the database
                const deletedOptions: Array<{ id: string, option_code: string, ubiqfy_code: string }> = [];
                for (const option of storeProductOptions) {
                    deletedOptions.push({
                        id: option.id,
                        option_code: option.option_code,
                        ubiqfy_code: option.storeProduct.ubiqfyProduct.product_code
                    });
                    await this.storeProductOptionRepository.remove(option);
                }

                const firstOption = storeProductOptions[0];
                this.logger.log(`✅ Deleted ${storeProductOptions.length} options from database for product: ${firstOption.storeProduct.ubiqfyProduct.name} (${firstOption.storeProduct.ubiqfyProduct.product_code})`);

                return {
                    message: 'Product deleted event processed - options removed from database',
                    deleted_options: deletedOptions.length,
                    deleted_product: {
                        ubiqfy_code: firstOption.storeProduct.ubiqfyProduct.product_code,
                        wp_sku: productData.sku,
                        status: 'deleted_from_database'
                    },
                    removed_options: deletedOptions
                };
            } else {
                this.logger.warn(`⚠️  No linked product found for deleted wp product: ${productData.sku}`);
                return {
                    message: 'No linked product found',
                    wp_sku: productData.sku
                };
            }
        } catch (error) {
            this.logger.error(`❌ Error handling product deletion for SKU ${productData.sku}:`, error.message);
            throw error;
        }
    }

    /**
     * Handle app installed event
     * Creates initial store record or updates existing one
     */
    private async handleAppInstalled(payload: wpAppInstallationWebhook): Promise<any> {
        this.logger.log(`🚀 App installed: ${payload.data.app_name} for merchant: ${payload.merchant}`);

        try {
            // Check if store already exists
            let store = await this.wpStoreRepository.findOne({
                where: { wp_store_id: payload.merchant.toString() }
            });

            if (store) {
                this.logger.log(`📝 Updating existing store for merchant: ${payload.merchant}`);

                // Update existing store - reactivate if it was uninstalled
                store.wp_store_name = store.wp_store_name || `Store ${payload.merchant}`;
                store.is_active = true; // Reactivate the store
                store.sync_status = SyncStatus.PENDING; // Reset sync status
                store.last_error_message = ''; // Clear previous errors

                // Clear revoked tokens if they exist
                if (store.wp_access_token === 'REVOKED') {
                    store.wp_access_token = 'pending';
                    store.wp_refresh_token = 'pending';
                }

                const updatedStore = await this.wpStoreRepository.save(store);

                // Reactivate linked products if they were deactivated
                try {
                    const deactivatedProducts = await this.storeProductRepository.find({
                        where: {
                            wp_store_id: updatedStore.id,
                            is_active: false
                        }
                    });

                    if (deactivatedProducts.length > 0) {
                        this.logger.log(`🔄 Reactivating ${deactivatedProducts.length} previously linked products`);

                        for (const product of deactivatedProducts) {
                            product.is_active = true;
                        }
                        await this.storeProductRepository.save(deactivatedProducts);

                        this.logger.log(`✅ Reactivated ${deactivatedProducts.length} products`);
                    }
                } catch (productError) {
                    this.logger.warn(`⚠️  Product reactivation warning: ${productError.message}`);
                }

                this.logger.log(`✅ Store reactivated with ID: ${updatedStore.id}`);

                return {
                    success: true,
                    message: 'Store reactivated, waiting for authorization',
                    store_id: updatedStore.id,
                    merchant_id: payload.merchant,
                    status: 'reactivated',
                    next_step: 'waiting_for_authorization'
                };
            }

            // Create new store record (without tokens - they come in app.store.authorize)
            this.logger.log(`📦 Creating new store record for merchant: ${payload.merchant}`);

            const newStore = new wpStore();
            newStore.wp_store_id = payload.merchant.toString();
            newStore.wp_store_name = `Store ${payload.merchant}`; // Temporary name
            newStore.wp_owner_name = 'Unknown'; // Will be updated when we get store info
            newStore.wp_owner_email = 'unknown@example.com'; // Placeholder
            newStore.wp_access_token = 'pending'; // Will be set in authorization
            newStore.wp_refresh_token = 'pending';
            newStore.wp_token_expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour temp
            newStore.wp_currency = 'SAR'; // Default
            newStore.is_active = true; // Active on installation
            newStore.sync_status = SyncStatus.PENDING;
            // Required Ubiqfy credentials - will be set through setup form
            newStore.ubiqfy_username = 'pending_setup';
            newStore.ubiqfy_password = 'pending_setup';
            newStore.ubiqfy_terminal_key = 'pending_setup';

            const savedStore = await this.wpStoreRepository.save(newStore);

            this.logger.log(`✅ New store created with ID: ${savedStore.id}, waiting for authorization`);

            return {
                success: true,
                message: 'Store registered, waiting for authorization',
                store_id: savedStore.id,
                merchant_id: payload.merchant,
                status: 'created',
                next_step: 'waiting_for_authorization'
            };
        } catch (error) {
            this.logger.error('❌ Failed to handle app installation:', error.message);
            throw new HttpException('Failed to register store', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Handle store authorization event
     * Updates store with access tokens and redirects to setup
     * Creates store record if it doesn't exist (handles webhook order issues)
     */
    private async handleStoreAuthorization(payload: wpStoreAuthorizationWebhook): Promise<any> {
        this.logger.log(`🔑 Store authorized for merchant: ${payload.merchant}`);

        try {
            // Find the existing store record
            let store = await this.wpStoreRepository.findOne({
                where: { wp_store_id: payload.merchant.toString() }
            });

            if (!store) {
                // Store doesn't exist - create it (handles case where authorization comes before installation)
                this.logger.warn(`⚠️ Store not found for merchant: ${payload.merchant}, creating new store record`);

                store = new wpStore();
                store.wp_store_id = payload.merchant.toString();
                store.wp_store_name = `Store ${payload.merchant}`; // Temporary name
                // store.wp_owner_name = 'Unknown'; // Will be updated when we get store info
                // store.wp_owner_email = 'unknown@example.com'; // Placeholder
                store.wp_currency = 'SAR'; // Default
                store.is_active = true; // Active on authorization
                store.sync_status = SyncStatus.PENDING;
                // Required Ubiqfy credentials - will be set through setup form
                store.ubiqfy_username = 'pending_setup';
                store.ubiqfy_password = 'pending_setup';
                store.ubiqfy_terminal_key = 'pending_setup';

                this.logger.log(`📦 Created store record during authorization for merchant: ${payload.merchant}`);
            }

            // Update store with authorization tokens
            store.wp_access_token = payload.data.access_token;
            store.wp_refresh_token = payload.data.refresh_token;
            store.wp_token_expiry = new Date(payload.data.expires * 1000); // Unix timestamp

            await this.wpStoreRepository.save(store);

            // Now fetch store information using the access token to get proper store details
            try {
                const storeInfo = await this.fetchStoreInfo(store);
                if (storeInfo) {
                    store.wp_store_name = storeInfo.name || `Store ${payload.merchant}`;
                    store.wp_owner_name = storeInfo.owner_name || 'Unknown';
                    store.wp_owner_email = storeInfo.owner_email || 'unknown@example.com';
                    store.wp_currency = storeInfo.currency || 'SAR';

                    await this.wpStoreRepository.save(store);

                    this.logger.log(`✅ Store info updated: ${store.wp_store_name}`);
                }
            } catch (infoError) {
                this.logger.warn(`⚠️  Could not fetch store info: ${infoError.message}`);
            }

            this.logger.log(`✅ Store authorized with ID: ${store.id}`);

            // Automatically register webhooks for this store
            try {
                this.logger.log(`🔗 Registering webhooks for store: ${store.wp_store_name}`);
                const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
                await this.webhookManagementService.registerWebhooksForStore(store.id, webhookBaseUrl);
                this.logger.log(`✅ Webhooks registered successfully for store: ${store.wp_store_name}`);
            } catch (webhookError) {
                this.logger.warn(`⚠️  Could not register webhooks automatically: ${webhookError.message}`);
                // Don't fail the authorization process if webhook registration fails
            }

            return {
                success: true,
                message: 'Store authorized successfully',
                store_id: store.id,
                store_name: store.wp_store_name,
                setup_url: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/wp-webhook/setup/${store.id}`,
                next_step: 'complete_ubiqfy_setup'
            };

        } catch (error) {
            this.logger.error('❌ Failed to handle store authorization:', error.message);
            throw new HttpException('Failed to authorize store', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Fetch store information from wp API
     */
    private async fetchStoreInfo(store: wpStore): Promise<any> {
        const headers = {
            'Authorization': `Bearer ${store.wp_access_token}`,
            'Accept': 'application/json'
        };

        const response = await fetch(`${process.env.wp_BASE_URL}store/info`, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch store info: ${response.status}`);
        }

        const result = await response.json();
        return result.data;
    }

    /**
     * Handle app uninstalled event
     * Deactivates store and cleans up sensitive data
     */
    private async handleAppUninstalled(payload: wpAppUninstallationWebhook): Promise<any> {
        this.logger.log(`🗑️  App uninstalled: ${payload.data.app_name} for merchant: ${payload.merchant}`);
        this.logger.log(`📅 Uninstallation date: ${payload.data.uninstallation_date}`);

        if (payload.data.reason) {
            this.logger.log(`📝 Uninstallation reason: ${payload.data.reason}`);
        }

        try {
            // Find the store record
            const store = await this.wpStoreRepository.findOne({
                where: { wp_store_id: payload.merchant.toString() }
            });

            if (!store) {
                this.logger.warn(`⚠️  Store not found for merchant: ${payload.merchant}`);
                return {
                    success: true,
                    message: 'Store was already removed or never existed',
                    merchant_id: payload.merchant
                };
            }

            this.logger.log(`🔍 Found store to deactivate: ${store.wp_store_name} (ID: ${store.id})`);

            // Option 1: Soft Delete - Deactivate store and clear sensitive data
            store.is_active = false;
            store.sync_status = SyncStatus.FAILED;

            // Clear sensitive authentication data
            store.wp_access_token = 'REVOKED';
            store.wp_refresh_token = 'REVOKED';
            store.wp_token_expiry = new Date(); // Expire immediately

            // Clear Ubiqfy credentials for security
            // store.ubiqfy_username = '';
            // store.ubiqfy_password = '';
            // store.ubiqfy_terminal_key = '';
            store.ubiqfy_plafond = 0;
            store.is_active = false;

            // Update last error with uninstallation info
            store.last_error_message = `App uninstalled on ${payload.data.uninstallation_date}`;

            await this.wpStoreRepository.save(store);

            // Option 2: You could also hard delete if preferred
            // await this.wpStoreRepository.remove(store);

            this.logger.log(`✅ Store deactivated successfully: ${store.wp_store_name}`);

            // Optional: Clean up related data (store products, etc.)
            try {
                const linkedProducts = await this.storeProductRepository.find({
                    where: { wp_store_id: store.id }
                });

                if (linkedProducts.length > 0) {
                    this.logger.log(`🧹 Cleaning up ${linkedProducts.length} linked products`);

                    // Option 1: Soft delete - mark as inactive
                    for (const product of linkedProducts) {
                        product.is_active = false;
                    }
                    await this.storeProductRepository.save(linkedProducts);

                    // Option 2: Hard delete if preferred
                    // await this.storeProductRepository.remove(linkedProducts);
                }
            } catch (cleanupError) {
                this.logger.warn(`⚠️  Product cleanup warning: ${cleanupError.message}`);
            }

            return {
                success: true,
                message: 'Store deactivated successfully',
                store_id: store.id,
                store_name: store.wp_store_name,
                merchant_id: payload.merchant,
                uninstalled_at: payload.data.uninstallation_date,
                cleanup_actions: [
                    'Store deactivated',
                    'Authentication tokens revoked',
                    'Ubiqfy credentials cleared',
                    'Linked products deactivated'
                ]
            };

        } catch (error) {
            this.logger.error('❌ Failed to handle app uninstallation:', error.message);
            throw new HttpException('Failed to process app uninstallation', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get store information for setup page
     */
    async getStoreForSetup(storeId: string): Promise<{ store: wpStore }> {
        const store = await this.wpStoreRepository.findOne({ where: { id: storeId } });

        if (!store) {
            throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
        }

        return { store };
    }

    /**
     * Complete Ubiqfy setup for a store
     */
    async completeUbiqfySetup(storeId: string, setupData: {
        ubiqfy_username: string;
        ubiqfy_password: string;
        ubiqfy_terminal_key: string;
        ubiqfy_sandbox: boolean;
        ubiqfy_plafond?: number;
    }): Promise<any> {
        const store = await this.wpStoreRepository.findOne({ where: { id: storeId } });

        if (!store) {
            throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
        }

        try {
            // Update store with Ubiqfy credentials
            store.ubiqfy_username = setupData.ubiqfy_username;
            store.ubiqfy_password = setupData.ubiqfy_password;
            store.ubiqfy_terminal_key = setupData.ubiqfy_terminal_key;
            store.ubiqfy_sandbox = setupData.ubiqfy_sandbox;
            store.ubiqfy_plafond = setupData.ubiqfy_plafond || 0;
            store.plafond_last_updated = new Date();
            store.is_active = true; // Activate the store
            store.sync_status = SyncStatus.PENDING;

            await this.wpStoreRepository.save(store);

            // TODO: Test Ubiqfy connection here
            // TODO: Register webhooks automatically
            // TODO: Sync initial products

            this.logger.log(`✅ Ubiqfy setup completed for store: ${store.wp_store_name}`);

            return {
                store_id: store.id,
                store_name: store.wp_store_name,
                status: 'active',
                ubiqfy_setup: 'completed',
                next_steps: [
                    'Test Ubiqfy connection',
                    'Register webhooks',
                    'Sync products from Ubiqfy'
                ]
            };

        } catch (error) {
            this.logger.error('❌ Failed to complete Ubiqfy setup:', error.message);
            throw new HttpException('Failed to complete setup', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
