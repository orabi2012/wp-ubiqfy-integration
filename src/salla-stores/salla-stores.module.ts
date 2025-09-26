import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { wpStore } from './wp-stores.entity';
import { wpStoreProduct } from './wp-store-products.entity';
import { wpStoreProductOption } from './wp-store-product-option.entity';
import { UbiqfyProduct } from '../ubiqfy-products/ubiqfy-product.entity';
import { wpStoresService } from './wp-stores.service';
import { wpStoreProductsService } from './wp-store-products.service';
import { wpStoreProductOptionsService } from './wp-store-product-options.service';
import { wpIntegrationService } from './wp-integration.service';
import { wpOAuthService } from './wp-oauth.service';
import { wpWebhookService } from './wp-webhook.service';
import { wpWebhookManagementService } from './wp-webhook-management.service';
import { wpStoresController } from './wp-stores.controller';
import { wpDevController } from './wp-dev.controller';
import { wpWebhookController } from './wp-webhook.controller';
import { UbiqfyProductsModule } from '../ubiqfy-products/ubiqfy-products.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([wpStore, wpStoreProduct, wpStoreProductOption, UbiqfyProduct]),
        ConfigModule,
        UbiqfyProductsModule
    ],
    controllers: [wpStoresController, wpDevController, wpWebhookController],
    providers: [wpStoresService, wpStoreProductsService, wpStoreProductOptionsService, wpIntegrationService, wpOAuthService, wpWebhookService, wpWebhookManagementService],
    exports: [wpStoresService, wpStoreProductsService, wpStoreProductOptionsService, wpIntegrationService, wpOAuthService, wpWebhookService, wpWebhookManagementService],
})
export class wpStoresModule { }
