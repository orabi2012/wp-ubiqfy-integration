import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { wpStoresService } from './wp-stores.service';
import { wpStoreProductsService } from './wp-store-products.service';
import { wpStoreProductOptionsService } from './wp-store-product-options.service';
import { wpIntegrationService } from './wp-integration.service';
import { UbiqfyProductsService } from '../ubiqfy-products/ubiqfy-products.service';
import { wpStore, SyncStatus } from './wp-stores.entity';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { StoreAccessGuard } from '../auth/store-access.guard';
import { isValidUUID } from '../utils/uuid.helper';

@Controller('wp-stores')
@UseGuards(AuthGuard('jwt'))
export class wpStoresController {
  constructor(
    private readonly wpStoresService: wpStoresService,
    private readonly storeProductsService: wpStoreProductsService,
    private readonly storeProductOptionsService: wpStoreProductOptionsService,
    private readonly wpIntegrationService: wpIntegrationService,
    private readonly ubiqfyProductsService: UbiqfyProductsService,
  ) { }

  private validateUUID(id: string): void {
    if (!isValidUUID(id)) {
      throw new HttpException('Invalid UUID format', HttpStatus.BAD_REQUEST);
    }
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  async create(@Body() createStoreDto: Partial<wpStore>) {
    try {
      // Validate required fields
      if (!createStoreDto.wp_store_url) {
        throw new HttpException(
          'WooCommerce Store URL is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if store already exists
      const existingStore = await this.wpStoresService.findByStoreUrl(
        createStoreDto.wp_store_url,
      );
      if (existingStore) {
        throw new HttpException(
          'Store with this URL already exists',
          HttpStatus.CONFLICT,
        );
      }

      return await this.wpStoresService.create(createStoreDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create store',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @UseGuards(SuperAdminGuard)
  async findAll() {
    return await this.wpStoresService.findAll();
  }

  @Get('active')
  @UseGuards(SuperAdminGuard)
  async findActiveStores() {
    return await this.wpStoresService.findActiveStores();
  }

  @Get(':id')
  @UseGuards(StoreAccessGuard)
  async findById(@Param('id') id: string) {
    this.validateUUID(id);
    const store = await this.wpStoresService.findById(id);
    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }
    return store;
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  async update(
    @Param('id') id: string,
    @Body() updateData: Partial<wpStore>,
  ) {
    this.validateUUID(id);
    const updatedStore = await this.wpStoresService.update(id, updateData);
    if (!updatedStore) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }
    return updatedStore;
  }

  @Put(':id/toggle-active')
  @UseGuards(SuperAdminGuard)
  async toggleActive(@Param('id') id: string) {
    this.validateUUID(id);
    const updatedStore = await this.wpStoresService.toggleActive(id);
    if (!updatedStore) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }
    return updatedStore;
  }

  @Put(':id/sync-status')
  async updateSyncStatus(
    @Param('id') id: string,
    @Body() body: { status: SyncStatus; errorMessage?: string },
  ) {
    this.validateUUID(id);
    await this.wpStoresService.updateSyncStatus(
      id,
      body.status,
      body.errorMessage,
    );
    return { message: 'Sync status updated successfully' };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    this.validateUUID(id);
    const store = await this.wpStoresService.findById(id);
    if (!store) {
      throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
    }
    await this.wpStoresService.delete(id);
    return { message: 'Store deleted successfully' };
  }

  @Post(':id/test-ubiqfy-auth')
  async testUbiqfyAuth(@Param('id') id: string) {
    this.validateUUID(id);
    try {
      const authResult =
        await this.wpStoresService.authenticateWithUbiqfy(id);
      return {
        message: 'Ubiqfy authentication successful',
        success: true,
        data: authResult,
      };
    } catch (error) {
      return {
        success: false,
        message: `Ubiqfy authentication failed: ${error.message}`,
        error: error.message,
        details: {
          timestamp: new Date().toISOString(),
          storeId: id
        }
      };
    }
  }

  @Post(':id/fetch-ubiqfy-products')
  @UseGuards(StoreAccessGuard)
  async fetchUbiqfyProducts(@Param('id') id: string) {
    this.validateUUID(id);
    try {
      const productsResult =
        await this.wpStoresService.fetchUbiqfyProducts(id);
      return {
        message: 'Ubiqfy products fetched successfully',
        success: true,
        data: productsResult,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch Ubiqfy products: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/products')
  @UseGuards(StoreAccessGuard)
  async getStoreCachedProducts(@Param('id') id: string) {
    this.validateUUID(id);
    try {
      const store = await this.wpStoresService.findById(id);
      if (!store) {
        throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
      }

      console.log('🔍 Store found:', { id: store.id, ubiqfy_sandbox: store.ubiqfy_sandbox });

      const products = await this.ubiqfyProductsService.findProductsByEnvironment(store.ubiqfy_sandbox);

      console.log('📦 Products found:', products.length);
      console.log('🔍 First product sample:', products[0] ? {
        id: products[0].id,
        product_code: products[0].product_code,
        name: products[0].name,
        is_sandbox: products[0].is_sandbox,
        optionsCount: products[0].options?.length || 0
      } : 'No products');

      // Extract distinct countries similar to fetchUbiqfyProducts
      const distinctCountries = [
        ...new Set(
          products
            .map((product) => product.country_iso)
            .filter((country) => country && country.trim() !== ''),
        ),
      ].sort();

      const responseData = {
        message: 'Cached products loaded successfully',
        success: true,
        data: {
          success: true,
          products: products,
          savedProducts: products.length,
          message: 'Products loaded from database',
          metadata: {
            productTypeCode: 'Voucher', // Default, since we don't store this
            productCount: products.length,
            savedToDatabase: products.length,
            distinctCountries: distinctCountries,
          },
        },
      };

      console.log('📤 Sending response:', {
        success: responseData.success,
        productCount: responseData.data.products.length,
        distinctCountries: responseData.data.metadata.distinctCountries.length
      });

      return responseData;
    } catch (error) {
      throw new HttpException(
        `Failed to load cached products: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Store-Product relationship endpoints

  @Post(':id/link-products')
  async linkProducts(
    @Param('id') storeId: string,
    @Body() linkData: { productCodes: string[] },
  ) {
    this.validateUUID(storeId);
    try {
      const storeProducts = await this.storeProductsService.linkProductsToStore(
        storeId,
        linkData.productCodes,
      );
      return {
        message: 'Products linked to store successfully',
        success: true,
        data: storeProducts,
        count: storeProducts.length,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to link products: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/bulk-link-products')
  async bulkLinkProducts(
    @Param('id') storeId: string,
    @Body()
    bulkData: {
      products: Array<{
        productCode: string;
        optionCode?: string;
        customPrice?: number;
        markupPercentage?: number;
        isActive?: boolean;
        // Essential pricing data from Ubiqfy API
        minValue?: number;
        maxValue?: number;
        minFaceValue?: number;
        productCurrencyCode?: string;
        minWholesaleValue?: number;
        maxWholesaleValue?: number;
      }>;
    },
  ) {
    this.validateUUID(storeId);
    try {
      const storeProducts = await this.storeProductsService.bulkLinkProducts(
        storeId,
        bulkData.products,
      );
      return {
        message: 'Products bulk linked successfully',
        success: true,
        data: storeProducts,
        count: storeProducts.length,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to bulk link products: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/products')
  async getStoreProducts(
    @Param('id') storeId: string,
    @Body('includeInactive') includeInactive: boolean = false,
  ) {
    this.validateUUID(storeId);
    try {
      const storeProducts = await this.storeProductsService.getStoreProducts(
        storeId,
        includeInactive,
      );
      return {
        message: 'Store products retrieved successfully',
        success: true,
        data: storeProducts,
        count: storeProducts.length,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get store products: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/synced-options')
  async getSyncedProductOptions(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const syncedOptions = await this.wpStoresService.getSyncedProductOptions(storeId);
      return {
        message: 'Synced product options retrieved successfully',
        success: true,
        data: syncedOptions,
        count: syncedOptions.length,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get synced product options: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id/products/:productId/toggle')
  async toggleProductActive(
    @Param('id') storeId: string,
    @Param('productId') productId: string,
  ) {
    this.validateUUID(storeId);
    this.validateUUID(productId);
    try {
      const storeProduct = await this.storeProductsService.toggleProductActive(
        storeId,
        productId,
      );
      return {
        message: 'Product status toggled successfully',
        success: true,
        data: storeProduct,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to toggle product status: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id/products/:productId')
  async unlinkProduct(
    @Param('id') storeId: string,
    @Param('productId') productId: string,
  ) {
    this.validateUUID(storeId);
    this.validateUUID(productId);
    try {
      await this.storeProductsService.unlinkProductFromStore(
        storeId,
        productId,
      );
      return {
        message: 'Product unlinked from store successfully',
        success: true,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to unlink product: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Update custom price for a product option (automatically updates markup percentage)
   */
  @Put(':id/products/:productId/options/:optionId/custom-price')
  async updateOptionCustomPrice(
    @Param('id') storeId: string,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Body() body: { customPrice: number },
  ) {
    this.validateUUID(storeId);
    this.validateUUID(productId);
    this.validateUUID(optionId);

    try {
      if (body.customPrice < 0) {
        throw new HttpException(
          'Custom price cannot be negative',
          HttpStatus.BAD_REQUEST,
        );
      }

      const updatedOption =
        await this.storeProductOptionsService.updateCustomPriceAndCalculateMarkup(
          optionId,
          body.customPrice,
        );

      return {
        message: 'Custom price updated successfully',
        success: true,
        data: {
          optionId: updatedOption.id,
          customPrice: updatedOption.custom_price,
          markupPercentage: updatedOption.markup_percentage,
          storeCurrencyPrice: updatedOption.store_currency_price,
        },
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update custom price: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Update markup percentage for a product option (automatically updates custom price)
   */
  @Put(':id/products/:productId/options/:optionId/markup-percentage')
  async updateOptionMarkupPercentage(
    @Param('id') storeId: string,
    @Param('productId') productId: string,
    @Param('optionId') optionId: string,
    @Body() body: { markupPercentage: number },
  ) {
    this.validateUUID(storeId);
    this.validateUUID(productId);
    this.validateUUID(optionId);

    try {
      const updatedOption =
        await this.storeProductOptionsService.updateMarkupAndCalculateCustomPrice(
          optionId,
          body.markupPercentage,
        );

      return {
        message: 'Markup percentage updated successfully',
        success: true,
        data: {
          optionId: updatedOption.id,
          customPrice: updatedOption.custom_price,
          markupPercentage: updatedOption.markup_percentage,
          storeCurrencyPrice: updatedOption.store_currency_price,
        },
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update markup percentage: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get all stored product options with pricing data for a store
   */
  @Get(':id/stored-options')
  @UseGuards(StoreAccessGuard)
  async getStoredProductOptions(@Param('id') storeId: string) {
    this.validateUUID(storeId);

    try {
      const storedOptions =
        await this.storeProductOptionsService.findSyncedOptionsForStore(
          storeId,
        );

      const optionsMap = {};
      storedOptions.forEach((option) => {
        optionsMap[option.option_code] = {
          id: option.id,
          optionCode: option.option_code,
          customPrice: option.custom_price,
          markupPercentage: option.markup_percentage,
          storeCurrencyPrice: option.store_currency_price,
          originalPriceUsd: option.original_price_usd,
        };
      });

      return {
        message: 'Stored options retrieved successfully',
        success: true,
        data: optionsMap,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get stored options: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/synced-products')
  @UseGuards(StoreAccessGuard)
  async getSyncedProducts(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const syncedProducts =
        await this.storeProductsService.getSyncedProducts(storeId);
      return {
        message: 'Synced products retrieved successfully',
        success: true,
        data: {
          products: syncedProducts,
          count: syncedProducts.length,
        },
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get synced products: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // wp Integration Endpoints

  @Post(':id/test-wp-connection')
  async testwpConnection(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const connectionTest =
        await this.wpIntegrationService.testwpConnection(storeId);
      return {
        message: connectionTest.connected
          ? 'wp connection successful'
          : 'wp connection failed',
        success: connectionTest.connected,
        data: connectionTest,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to test wp connection: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/clear-credentials')
  @UseGuards(StoreAccessGuard)
  async clearWooCommerceCredentials(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const result = await this.wpIntegrationService.clearWooCommerceCredentials(storeId);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to initiate re-authorization: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/sync-to-wp')
  @UseGuards(StoreAccessGuard)
  async syncProductsTowp(
    @Param('id') storeId: string,
    @Body() body?: { selectedOptions?: Array<{ productCode: string; optionCode?: string }> }
  ) {
    this.validateUUID(storeId);
    try {
      // Update sync status to 'syncing' before starting
      await this.wpStoresService.updateSyncStatus(storeId, SyncStatus.SYNCING);

      const syncResult =
        await this.wpIntegrationService.syncProductsTowp(storeId, body?.selectedOptions);

      // Update sync status to 'success' and set product count on successful sync
      const totalProductsSynced = syncResult.products.length;
      await this.wpStoresService.updateSyncStatus(storeId, SyncStatus.SUCCESS);
      await this.wpStoresService.setProductCount(storeId, totalProductsSynced);

      return {
        message: 'Products synced to wp successfully',
        success: true,
        data: {
          ...syncResult,
          totalProductsSynced,
          lastSyncAt: new Date()
        },
      };
    } catch (error) {
      // Update sync status to 'failed' with error message
      await this.wpStoresService.updateSyncStatus(storeId, SyncStatus.FAILED, error.message);

      throw new HttpException(
        `Failed to sync products to wp: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/verify-sync-status')
  @UseGuards(StoreAccessGuard)
  async verifySyncStatus(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const verificationResult =
        await this.wpIntegrationService.verifySyncStatus(storeId);
      return {
        message: 'Sync status verification completed',
        success: true,
        data: verificationResult,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to verify sync status: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/wp-categories')
  async getwpCategories(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const categories =
        await this.wpIntegrationService.getwpCategories(storeId);
      return {
        message: 'wp categories retrieved successfully',
        success: true,
        data: categories,
        count: categories.length,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get wp categories: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id/wp-products')
  async getwpProducts(@Param('id') storeId: string) {
    this.validateUUID(storeId);
    try {
      const products =
        await this.wpIntegrationService.getwpProducts(storeId);
      return {
        message: 'wp products retrieved successfully',
        success: true,
        data: products,
        count: products.length,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get wp products: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }



  @Post('migrate-to-new-options-system')
  async migrateToNewOptionsSystem() {
    try {
      const result =
        await this.storeProductsService.migrateExistingProductsToNewSystem();

      return {
        message: 'Migration completed successfully',
        success: true,
        data: {
          processed: result.processed,
          created: result.created,
          errors: result.errors,
          summary: `Processed ${result.processed} products, created ${result.created} option records`,
        },
      };
    } catch (error) {
      throw new HttpException(
        `Migration failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create a new product option with custom pricing
   * This handles cases where the option doesn't exist in DB yet
   */
  @Post(':id/create-option')
  @UseGuards(StoreAccessGuard)
  async createProductOption(
    @Param('id') storeId: string,
    @Body() createOptionDto: {
      optionCode: string;
      customPrice?: number;
      markupPercentage?: number;
    }
  ) {
    this.validateUUID(storeId);

    try {
      const { optionCode, customPrice, markupPercentage } = createOptionDto;

      if (!optionCode) {
        throw new HttpException(
          'Option code is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Find existing option first
      const existingOption = await this.storeProductOptionsService.findByOptionCode(
        storeId,
        optionCode
      );

      if (existingOption) {
        // Option exists, update it instead
        let updatedOption = existingOption;

        if (customPrice !== undefined && customPrice !== null) {
          updatedOption = await this.storeProductOptionsService.updateCustomPriceAndCalculateMarkup(
            existingOption.id,
            customPrice
          );
        } else if (markupPercentage !== undefined && markupPercentage !== null) {
          updatedOption = await this.storeProductOptionsService.updateMarkupAndCalculateCustomPrice(
            existingOption.id,
            markupPercentage
          );
        }

        return {
          success: true,
          message: 'Option updated successfully',
          data: {
            optionId: updatedOption.id,
            optionCode: updatedOption.option_code,
            customPrice: updatedOption.custom_price,
            markupPercentage: updatedOption.markup_percentage,
          },
        };
      }

      // Option doesn't exist - attempt to hydrate it from the cached Ubiqfy catalog
      const store = await this.wpStoresService.findById(storeId);
      if (!store) {
        throw new HttpException('Store not found', HttpStatus.NOT_FOUND);
      }

      const catalogOption = await this.ubiqfyProductsService.findOptionByCode(
        optionCode,
        store.ubiqfy_sandbox,
      );

      if (!catalogOption || !catalogOption.product) {
        throw new HttpException(
          'Option not found in cached catalog. Please fetch products from Ubiqfy to refresh the cache.',
          HttpStatus.NOT_FOUND,
        );
      }

      try {
        // Ensure the parent product is linked to the store (creates store options as a side effect)
        await this.storeProductsService.linkProductsToStore(storeId, [catalogOption.product.product_code]);
      } catch (linkError) {
        throw new HttpException(
          `Failed to link product ${catalogOption.product.product_code} to store: ${linkError.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Re-check for the option now that the product has been linked
      const createdOption = await this.storeProductOptionsService.findByOptionCode(
        storeId,
        optionCode,
      );

      if (!createdOption) {
        throw new HttpException(
          'Option could not be created from cached catalog data. Please try fetching products again.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      let updatedOption = createdOption;

      if (customPrice !== undefined && customPrice !== null) {
        updatedOption = await this.storeProductOptionsService.updateCustomPriceAndCalculateMarkup(
          createdOption.id,
          customPrice,
        );
      } else if (markupPercentage !== undefined && markupPercentage !== null) {
        updatedOption = await this.storeProductOptionsService.updateMarkupAndCalculateCustomPrice(
          createdOption.id,
          markupPercentage,
        );
      }

      return {
        success: true,
        message: 'Option created from cached catalog data successfully',
        data: {
          optionId: updatedOption.id,
          optionCode: updatedOption.option_code,
          customPrice: updatedOption.custom_price,
          markupPercentage: updatedOption.markup_percentage,
        },
      };

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to create/update option: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update custom price for an existing option (simpler endpoint for frontend)
   */
  @Post(':id/update-option-custom-price')
  @UseGuards(StoreAccessGuard)
  async updateOptionCustomPriceSimple(
    @Param('id') storeId: string,
    @Body() updateDto: { optionId: string; customPrice: number }
  ) {
    this.validateUUID(storeId);

    try {
      const { optionId, customPrice } = updateDto;

      if (!optionId || customPrice == null) {
        throw new HttpException(
          'Option ID and custom price are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.validateUUID(optionId);

      const updatedOption = await this.storeProductOptionsService.updateCustomPriceAndCalculateMarkup(
        optionId,
        customPrice
      );

      return {
        success: true,
        message: 'Custom price updated successfully',
        data: {
          optionId: updatedOption.id,
          customPrice: updatedOption.custom_price,
          markupPercentage: updatedOption.markup_percentage,
        },
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update custom price: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update markup percentage for an existing option (simpler endpoint for frontend)
   */
  @Post(':id/update-option-markup')
  @UseGuards(StoreAccessGuard)
  async updateOptionMarkupSimple(
    @Param('id') storeId: string,
    @Body() updateDto: { optionId: string; markupPercentage: number }
  ) {
    this.validateUUID(storeId);

    try {
      const { optionId, markupPercentage } = updateDto;

      if (!optionId || markupPercentage == null) {
        throw new HttpException(
          'Option ID and markup percentage are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.validateUUID(optionId);

      const updatedOption = await this.storeProductOptionsService.updateMarkupAndCalculateCustomPrice(
        optionId,
        markupPercentage
      );

      return {
        success: true,
        message: 'Markup percentage updated successfully',
        data: {
          optionId: updatedOption.id,
          customPrice: updatedOption.custom_price,
          markupPercentage: updatedOption.markup_percentage,
        },
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update markup percentage: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
