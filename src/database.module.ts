import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/users.entity';
import { wpStore } from './wp-stores/wp-stores.entity';
import { wpStoreProduct } from './wp-stores/wp-store-products.entity';
import { wpStoreProductOption } from './wp-stores/wp-store-product-option.entity';
import { UbiqfyProduct } from './ubiqfy-products/ubiqfy-product.entity';
import { UbiqfyProductOption } from './ubiqfy-products/ubiqfy-product-option.entity';
import { MerchantVoucherPurchase } from './voucher-purchases/merchant-voucher-purchase.entity';
import { MerchantVoucherPurchaseItem } from './voucher-purchases/merchant-voucher-purchase-item.entity';
import { MerchantVoucherPurchaseDetail } from './voucher-purchases/merchant-voucher-purchase-detail.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const isProduction = config.get<string>('NODE_ENV') === 'production';
                const sslEnabled = config.get<string>('DB_SSL_ENABLED', 'false') === 'true';
                const dbHost = config.get<string>('DB_HOST');

                // Check if connecting to a remote database (like Render.com)
                const isRemoteDb = dbHost && !dbHost.includes('localhost') && !dbHost.includes('127.0.0.1');

                let sslConfig: boolean | object = false;
                if (sslEnabled || isRemoteDb) {
                    sslConfig = {
                        rejectUnauthorized: false // For remote databases, often need this
                    };
                }

                return {
                    type: 'mysql',
                    host: dbHost,
                    port: config.get<number>('DB_PORT'),
                    username: config.get<string>('DB_USERNAME'),
                    password: config.get<string>('DB_PASSWORD'),
                    database: config.get<string>('DB_DATABASE'),
                    entities: [
                        User,
                        wpStore,
                        wpStoreProduct,
                        wpStoreProductOption,
                        UbiqfyProduct,
                        UbiqfyProductOption,
                        MerchantVoucherPurchase,
                        MerchantVoucherPurchaseItem,
                        MerchantVoucherPurchaseDetail
                    ],
                    synchronize: !isProduction,
                    ssl: sslConfig,
                    timezone: '+03:00', // KSA timezone (UTC+3) for MySQL
                    extra: {
                        connectionLimit: 10,
                        acquireTimeout: 60000,
                        timeout: 60000,
                        // Set MySQL timezone for this connection
                        timezone: '+03:00',
                    }
                };
            },
        }),
    ],
})
export class DatabaseModule { }
