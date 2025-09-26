import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { wpStoresModule } from '../wp-stores/wp-stores.module';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [wpStoresModule, UsersModule],
    controllers: [AdminController],
})
export class AdminModule { }
