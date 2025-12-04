import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { IpService } from './ip.service';

@Controller('debug')
export class IpController {
    constructor(private readonly ipService: IpService) { }

    @Get('ip')
    async getPublicIp(): Promise<{ ip: string }> {
        try {
            const ip = await this.ipService.getPublicIp();
            return { ip };
        } catch (error) {
            throw new InternalServerErrorException('Failed to retrieve public IP');
        }
    }
}
