import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantVoucherPurchase } from './merchant-voucher-purchase.entity';
import { MerchantVoucherPurchaseItem } from './merchant-voucher-purchase-item.entity';
import { MerchantVoucherPurchaseDetail } from './merchant-voucher-purchase-detail.entity';
import { wpStoreProductOption } from '../wp-stores/wp-store-product-option.entity';
import { wpStore } from '../wp-stores/wp-stores.entity';
import { VoucherPurchasesService } from './voucher-purchases.service';
import { VoucherPurchasesController } from './voucher-purchases.controller';
import { DoTransactionService } from './dotransaction.service';
import { UbiqfyProductsModule } from '../ubiqfy-products/ubiqfy-products.module';
import { wpStoresModule } from '../wp-stores/wp-stores.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            MerchantVoucherPurchase,
            MerchantVoucherPurchaseItem,
            MerchantVoucherPurchaseDetail,
            wpStoreProductOption,
            wpStore
        ]),
        UbiqfyProductsModule,
        wpStoresModule,
        AuthModule
    ],
    controllers: [VoucherPurchasesController],
    providers: [VoucherPurchasesService, DoTransactionService],
    exports: [VoucherPurchasesService, DoTransactionService],
})
export class VoucherPurchasesModule { }
