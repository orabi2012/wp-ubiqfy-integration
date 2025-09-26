import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { wpStore } from './wp-stores.entity';
import axios from 'axios';

export interface WebhookRegistration {
  name: string;
  event: string;
  url: string;
  version?: number;
  headers?: Array<{
    key: string;
    value: string;
  }>;
}

export interface wpWebhookResponse {
  status: number;
  success: boolean;
  data: {
    id: number;
    name: string;
    event: string;
    type: string;
    url: string;
    version: number;
    headers?: Record<string, string>;
  };
}

@Injectable()
export class wpWebhookManagementService {
  private readonly logger = new Logger(wpWebhookManagementService.name);
  private readonly wp_BASE_URL = process.env.wp_BASE_URL || 'https://api.wp.dev/admin/v2';

  constructor(
    @InjectRepository(wpStore)
    private readonly wpStoreRepository: Repository<wpStore>,
  ) { }

  /**
   * Register all required webhooks for a store
   */
  async registerWebhooksForStore(
    storeId: string,
    webhookBaseUrl: string,
  ): Promise<any[]> {
    const store = await this.wpStoreRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }

    if (!store.wp_access_token) {
      throw new HttpException(
        'wp access token not configured for this store',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Define the webhooks we need for app and product management
    const requiredWebhooks: WebhookRegistration[] = [
      {
        name: 'App Installed - Ubiqfy Integration',
        event: 'app.installed',
        url: `${webhookBaseUrl}/wp-webhook/handle`,
        version: 2,
        headers: [
          {
            key: 'X-Integration',
            value: 'ubiqfy-app-installation',
          },
        ],
      },
      {
        name: 'Product Deleted - Ubiqfy Integration',
        event: 'product.deleted',
        url: `${webhookBaseUrl}/wp-webhook/handle`,
        version: 2,
        headers: [
          {
            key: 'X-Store-ID',
            value: store.id,
          },
        ],
      },
    ];

    const results: any[] = [];

    for (const webhook of requiredWebhooks) {
      try {
        this.logger.log(
          `🔗 Registering webhook: ${webhook.event} for store ${store.wp_store_id}`,
        );
        const result = await this.registerWebhook(store, webhook);
        results.push({
          event: webhook.event,
          status: 'success',
          webhook_id: result.data.id,
          url: result.data.url,
        });
        this.logger.log(
          `✅ Webhook registered successfully: ${webhook.event} (ID: ${result.data.id})`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Failed to register webhook ${webhook.event}:`,
          error.message,
        );
        results.push({
          event: webhook.event,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Register a single webhook
   */
  async registerWebhook(
    store: wpStore,
    webhook: WebhookRegistration,
  ): Promise<wpWebhookResponse> {
    const headers = {
      Authorization: `Bearer ${store.wp_access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const payload = {
      name: webhook.name,
      event: webhook.event,
      url: webhook.url,
      version: webhook.version || 2,
      headers: webhook.headers || [],
    };

    this.logger.debug('Webhook registration payload:', payload);

    try {
      const response = await axios.post(
        `${this.wp_BASE_URL}/webhooks/subscribe`,
        payload,
        { headers },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Webhook registration error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });

      if (error.response?.status === 401) {
        throw new Error('Invalid or expired wp access token');
      } else if (error.response?.status === 422) {
        const validationErrors =
          error.response?.data?.errors ||
          error.response?.data?.error ||
          'Validation failed';
        throw new Error(
          `Webhook validation error: ${JSON.stringify(validationErrors)}`,
        );
      } else {
        throw new Error(`Failed to register webhook: ${error.message}`);
      }
    }
  }

  /**
   * List all active webhooks for a store
   */
  async listWebhooks(storeId: string): Promise<any> {
    const store = await this.wpStoreRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }

    if (!store.wp_access_token) {
      throw new HttpException(
        'wp access token not configured',
        HttpStatus.BAD_REQUEST,
      );
    }

    const headers = {
      Authorization: `Bearer ${store.wp_access_token}`,
      Accept: 'application/json',
    };

    try {
      const response = await axios.get(`${this.wp_BASE_URL}/webhooks`, {
        headers,
      });
      return response.data;
    } catch (error) {
      this.logger.error(
        'List webhooks error:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        `Failed to list webhooks: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Deactivate/Delete a webhook
   */
  async deactivateWebhook(storeId: string, webhookId: number): Promise<any> {
    const store = await this.wpStoreRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }

    const headers = {
      Authorization: `Bearer ${store.wp_access_token}`,
      Accept: 'application/json',
    };

    try {
      const response = await axios.delete(
        `${this.wp_BASE_URL}/webhooks/${webhookId}`,
        { headers },
      );
      this.logger.log(`✅ Webhook deactivated: ${webhookId}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `❌ Failed to deactivate webhook ${webhookId}:`,
        error.response?.data || error.message,
      );
      throw new HttpException(
        `Failed to deactivate webhook: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get available webhook events
   */
  async getWebhookEvents(storeId: string): Promise<any> {
    const store = await this.wpStoreRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }

    const headers = {
      Authorization: `Bearer ${store.wp_access_token}`,
      Accept: 'application/json',
    };

    try {
      const response = await axios.get(
        `${this.wp_BASE_URL}/webhooks/events`,
        { headers },
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Get webhook events error:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        `Failed to get webhook events: ${error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
