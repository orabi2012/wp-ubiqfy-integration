import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IpService {
    private readonly logger = new Logger(IpService.name);

    async getPublicIp(): Promise<string> {
        try {
            const response = await fetch('https://api.ipify.org?format=json');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as { ip: string };
            this.logger.log(`Fetched public IP: ${data.ip}`);

            return data.ip;
        } catch (error) {
            this.logger.error('Failed to fetch public IP:', error);
            throw new Error('Unable to retrieve public IP address');
        }
    }
}
