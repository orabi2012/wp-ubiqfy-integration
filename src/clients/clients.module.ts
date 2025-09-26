import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { wpStoresModule } from '../wp-stores/wp-stores.module';
import { VoucherPurchasesModule } from '../voucher-purchases/voucher-purchases.module';

@Module({
  imports: [wpStoresModule, VoucherPurchasesModule],
  controllers: [ClientsController],
})
export class ClientsModule { }
