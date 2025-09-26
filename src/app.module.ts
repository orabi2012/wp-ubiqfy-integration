import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from './database.module';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { wpStoresModule } from './wp-stores/wp-stores.module';
import { ClientsModule } from './clients/clients.module';
import { StoreModule } from './store/store.module';
import { UbiqfyProductsModule } from './ubiqfy-products/ubiqfy-products.module';
import { VoucherPurchasesModule } from './voucher-purchases/voucher-purchases.module';
import { AdminModule } from './admin/admin.module';
import { UtilsModule } from './utils/utils.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    wpStoresModule,
    ClientsModule,
    StoreModule,
    UbiqfyProductsModule,
    VoucherPurchasesModule,
    UsersModule,
    AdminModule,
    UtilsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule { }
