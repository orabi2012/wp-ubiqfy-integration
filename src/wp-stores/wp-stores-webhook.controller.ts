import { Body, Controller, HttpException, HttpStatus, Logger, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { wpStoresService } from './wp-stores.service';
import { wpStoreProductOptionsService } from './wp-store-product-options.service';
import { isValidUUID } from '../utils/uuid.helper';
import { wpStore } from './wp-stores.entity';

interface WebhookResponse {
    success: boolean;
    event: string | null;
    data?: any;
    message?: string;
}

@Controller('wp-stores/webhooks')
export class wpStoresWebhookController {
    private readonly logger = new Logger(wpStoresWebhookController.name);

    constructor(
        private readonly wpStoresService: wpStoresService,
        private readonly storeProductOptionsService: wpStoreProductOptionsService,
    ) { }

    @Post(':storeId')
    async handleWebhook(
        @Param('storeId') storeId: string,
        @Req() request: Request & { rawBody?: Buffer | string },
        @Body() payload: any,
    ): Promise<WebhookResponse> {
        this.ensureValidStoreId(storeId);
        const store = await this.getStore(storeId);

        const rawBody = this.getRawBody(request, payload);
        this.verifySignature(store, request, rawBody);

        const topic = this.getHeaderValue(request, 'x-wc-webhook-topic');
        const event = this.getHeaderValue(request, 'x-wc-webhook-event');
        const topicLower = topic?.toLowerCase() ?? '';
        const eventLower = event?.toLowerCase() ?? '';

        this.logger.log(
            `📬 Received WooCommerce webhook for store ${store.wp_store_name} (${store.id}) - topic: ${topic}, event: ${event}`,
        );

        const isProductDeleted =
            topicLower === 'product.deleted' ||
            topicLower === 'product.trashed' ||
            eventLower === 'deleted' ||
            eventLower === 'product.deleted' ||
            eventLower === 'trashed';

        if (isProductDeleted) {
            const result = await this.storeProductOptionsService.handleWooProductDeleted(
                store,
                payload,
            );

            return {
                success: true,
                event: topic || event || 'product.deleted',
                data: result,
            };
        }

        this.logger.warn(
            `⚠️  Unsupported WooCommerce webhook topic/event received: topic=${topic}, event=${event}`,
        );

        return {
            success: true,
            event: topic || event || 'unknown',
            message: 'Webhook received but no handler executed',
        };
    }

    private ensureValidStoreId(storeId: string): void {
        if (!isValidUUID(storeId)) {
            throw new HttpException('Invalid store ID format', HttpStatus.BAD_REQUEST);
        }
    }

    private async getStore(storeId: string): Promise<wpStore> {
        const store = await this.wpStoresService.findById(storeId);
        if (!store) {
            throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
        }

        if (!store.wp_webhook_key) {
            throw new HttpException(
                'Webhook secret key is not configured for this store',
                HttpStatus.BAD_REQUEST,
            );
        }

        return store;
    }

    private getRawBody(request: Request & { rawBody?: Buffer | string }, payload: any): Buffer {
        if (request.rawBody) {
            return Buffer.isBuffer(request.rawBody)
                ? request.rawBody
                : Buffer.from(request.rawBody);
        }

        return Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
    }

    private verifySignature(store: wpStore, request: Request, rawBody: Buffer): void {
        const signatureHeader = this.getHeaderValue(request, 'x-wc-webhook-signature');

        if (!signatureHeader) {
            this.logger.warn('❌ Missing X-WC-Webhook-Signature header');
            throw new HttpException('Missing webhook signature', HttpStatus.UNAUTHORIZED);
        }

        const digest = createHmac('sha256', store.wp_webhook_key)
            .update(rawBody)
            .digest('base64');

        const signatureBuffer = Buffer.from(signatureHeader, 'base64');
        const digestBuffer = Buffer.from(digest, 'base64');

        if (signatureBuffer.length !== digestBuffer.length) {
            this.logger.warn('❌ Invalid webhook signature length mismatch');
            throw new HttpException('Invalid webhook signature', HttpStatus.UNAUTHORIZED);
        }

        if (!timingSafeEqual(signatureBuffer, digestBuffer)) {
            this.logger.warn('❌ Webhook signature verification failed');
            throw new HttpException('Invalid webhook signature', HttpStatus.UNAUTHORIZED);
        }
    }

    private getHeaderValue(request: Request, headerName: string): string | null {
        const headerValue = request.headers[headerName] ?? request.headers[headerName.toLowerCase()];

        if (!headerValue) {
            return null;
        }

        if (Array.isArray(headerValue)) {
            return headerValue[0] ?? null;
        }

        return headerValue;
    }
}
