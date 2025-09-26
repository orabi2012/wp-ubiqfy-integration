import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { VoucherPurchasesModule } from '../voucher-purchases/voucher-purchases.module';
import { wpStoresModule } from '../wp-stores/wp-stores.module';

@Module({
    imports: [VoucherPurchasesModule, wpStoresModule],
    controllers: [StoreController],
})
export class StoreModule { }
