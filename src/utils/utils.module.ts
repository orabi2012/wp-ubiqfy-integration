import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordService } from './password.service';
import { PasswordMigrationService } from './password-migration.service';
import { wpStore } from '../wp-stores/wp-stores.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([wpStore])
    ],
    providers: [PasswordService, PasswordMigrationService],
    exports: [PasswordService, PasswordMigrationService],
})
export class UtilsModule { }
