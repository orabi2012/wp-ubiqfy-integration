import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordService } from './password.service';
import { PasswordMigrationService } from './password-migration.service';
import { wpStore } from '../wp-stores/wp-stores.entity';
import { EncryptionService } from './encryption.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([wpStore])
    ],
    providers: [PasswordService, PasswordMigrationService, EncryptionService],
    exports: [PasswordService, PasswordMigrationService, EncryptionService],
})
export class UtilsModule { }
