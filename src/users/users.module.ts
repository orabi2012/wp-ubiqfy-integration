import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './users.entity';
import { wpStoresModule } from '../wp-stores/wp-stores.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
        wpStoresModule,
    ],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
