import { Module } from '@nestjs/common';
import { IpService } from './ip.service';
import { IpController } from './ip.controller';

@Module({
    controllers: [IpController],
    providers: [IpService],
    exports: [IpService],
})
export class IpModule { }
