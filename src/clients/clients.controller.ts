import {
  Controller,
  Get,
  Render,
  UseGuards,
  Request,
  Post,
  Redirect,
  Body,
  Param,
  Put,
  Delete,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { StoreAccessGuard } from '../auth/store-access.guard';
import { wpStoresService } from '../wp-stores/wp-stores.service';
import { wpStore } from '../wp-stores/wp-stores.entity';
import { DoTransactionService } from '../voucher-purchases/dotransaction.service';

@Controller('clients')
@UseGuards(AuthGuard('jwt'))
export class ClientsController {
  constructor(
    private readonly wpStoresService: wpStoresService,
    private readonly doTransactionService: DoTransactionService
  ) { }

  @Get()
  @UseGuards(SuperAdminGuard)
  @Render('clients/index')
  async getClients(@Request() req) {
    const stores = await this.wpStoresService.findAll();
    return {
      title: 'wp Stores Management',
      user: req.user,
      stores: stores,
    };
  }

  @Get('add')
  @UseGuards(SuperAdminGuard)
  @Render('clients/add')
  async getAddClient(@Request() req) {
    const errorParam = req.query.error;
    const successParam = req.query.success;

    let errorMessage: string | null = null;
    let successMessage: string | null = null;

    if (errorParam === 'missing_wp_credentials') {
      errorMessage =
        'wp Client ID and Client Secret are required. Please get them from your wp Partner Portal.';
    } else if (errorParam === 'failed_to_add') {
      errorMessage =
        'Failed to add store. Please check your information and try again.';
    } else if (errorParam) {
      errorMessage = decodeURIComponent(errorParam as string);
    }

    if (successParam === 'store_added') {
      successMessage = 'Store added successfully!';
    }

    return {
      title: 'Add New Store',
      user: req.user,
      error: errorMessage,
      success: successMessage,
    };
  }

  @Get('edit/:id')
  @UseGuards(StoreAccessGuard)
  @Render('clients/edit')
  async getEditClient(@Request() req, @Param('id') id: string) {
    const store = await this.wpStoresService.findById(id);
    if (!store) {
      return { redirect: '/clients?error=store_not_found' };
    }
    return {
      title: 'Edit Store',
      user: req.user,
      store: store,
    };
  }

  @Get('stock/:id')
  @UseGuards(StoreAccessGuard)
  @Render('clients/stock')
  async getStockManagement(@Request() req, @Param('id') id: string) {
    const store = await this.wpStoresService.findById(id);
    if (!store) {
      return { redirect: '/clients?error=store_not_found' };
    }

    // Get comprehensive stock info including voucher tracking
    const stockInfo = await this.doTransactionService.getStoreStockInfo(id);

    // Get all synced product options for this store (for backward compatibility)
    const syncedOptions = await this.wpStoresService.getSyncedProductOptions(id);

    return {
      title: 'Stock Management - ' + store.wp_store_name,
      user: req.user,
      store: store,
      syncedOptions: syncedOptions,
      stockInfo: stockInfo, // Enhanced stock information with voucher tracking
    };
  }

  @Get('stock/:id/navigate')
  @UseGuards(StoreAccessGuard)
  async navigateToStockAfterPurchase(@Request() req, @Param('id') id: string, @Res() res) {
    try {
      // This endpoint is called after successful voucher purchase processing
      // to refresh stock and navigate to the stock management page

      const store = await this.wpStoresService.findById(id);
      if (!store) {
        return res.redirect('/clients?error=store_not_found');
      }

      // Optional: You could refresh wp stock data here if needed
      // await this.wpStoresService.refreshwpStockData(id);

      // Navigate to stock management page with success message
      return res.redirect(`/clients/stock/${id}?success=vouchers_synced_successfully`);

    } catch (error) {
      console.error('Error navigating to stock page:', error);
      return res.redirect(`/clients/stock/${id}?error=navigation_failed`);
    }
  }

  @Get('sync/:id')
  @UseGuards(StoreAccessGuard)
  @Render('clients/sync')
  async getSyncManagement(@Request() req, @Param('id') id: string) {
    const store = await this.wpStoresService.findById(id);
    if (!store) {
      return { redirect: '/clients?error=store_not_found' };
    }

    return {
      title: 'Sync Management - ' + store.wp_store_name,
      user: req.user,
      store: store,
    };
  }

  @Post('stock/:id/save-levels')
  @UseGuards(StoreAccessGuard)
  async saveStockLevels(@Param('id') storeId: string, @Body() body: { stockLevels: Array<{ optionId: string, stockLevel: number }> }, @Res() res) {
    try {
      const { stockLevels } = body;

      if (!stockLevels || !Array.isArray(stockLevels)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid stock levels data'
        });
      }

      // Validate each stock level
      for (const item of stockLevels) {
        if (!item.optionId || typeof item.stockLevel !== 'number' || item.stockLevel < 0) {
          return res.status(400).json({
            success: false,
            message: `Invalid data for option ${item.optionId}: stock level must be a number >= 0`
          });
        }
      }

      // Update stock levels in database
      const updated = await this.wpStoresService.updateStockLevels(stockLevels);

      return res.json({
        success: true,
        updated: updated,
        message: `Successfully updated ${updated} stock level(s)`
      });

    } catch (error) {
      console.error('Error saving stock levels:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save stock levels: ' + error.message
      });
    }
  }

  @Post('stock/:storeId/refresh-single')
  @UseGuards(StoreAccessGuard)
  async refreshSingleStock(
    @Param('storeId') storeId: string,
    @Body() body: { optionId: string, wpProductId: string }
  ) {
    try {
      const { optionId, wpProductId } = body;

      if (!optionId || !wpProductId) {
        return {
          success: false,
          message: 'Option ID and wp Product ID are required'
        };
      }

      const result = await this.wpStoresService.refreshSingleProductStock(optionId, wpProductId);

      return result;

    } catch (error) {
      console.error('Error refreshing single stock:', error);
      return {
        success: false,
        message: 'Failed to refresh stock: ' + error.message
      };
    }
  }

  @Post('stock/:storeId/refresh-all')
  @UseGuards(StoreAccessGuard)
  async refreshAllStock(@Param('storeId') storeId: string) {
    try {
      const result = await this.wpStoresService.refreshAllStoreStock(storeId);
      return result;

    } catch (error) {
      console.error('Error refreshing all stock:', error);
      return {
        success: false,
        message: 'Failed to refresh all stock: ' + error.message
      };
    }
  }

  @Post('add')
  @UseGuards(SuperAdminGuard)
  async addClient(@Body() body: any, @Res() res) {
    try {
      // Handle toggle switches properly
      const storeData: Partial<wpStore> = {
        ...body,
        // Parse currency conversion rate
        currency_conversion_rate:
          parseFloat(body.currency_conversion_rate) || 3.75,
        ubiqfy_currency: body.ubiqfy_currency || 'USD',
        sku_prefix: body.sku_prefix || 'UBQ',
        // Toggle switches: 'true' when on, undefined when off
        is_active: true, // New stores are active by default
        ubiqfy_sandbox: body.ubiqfy_sandbox === 'true',
      };

      if (body.wp_consumer_secret && body.wp_consumer_secret.trim() === '') {
        delete storeData.wp_consumer_secret;
      }

      console.log('Adding store with data:', {
        currency_conversion_rate: storeData.currency_conversion_rate,
        ubiqfy_currency: storeData.ubiqfy_currency,
      });

      await this.wpStoresService.create(storeData);
      return res.redirect('/clients?success=store_added');
    } catch (error) {
      console.error('Error adding store:', error);
      return res.redirect('/clients/add?error=failed_to_add');
    }
  }

  @Post('edit/:id')
  @UseGuards(StoreAccessGuard)
  async editClient(@Param('id') id: string, @Body() body: any, @Res() res, @Request() req) {
    try {


      // Define protected fields that only superadmins can modify
      const protectedFields = [
        'wp_store_url',
        'wp_store_name',
        'ubiqfy_producttypecode',
        'sku_prefix'
      ];

      // Handle toggle switches - they send 'true' when on, nothing when off
      const updateData: Partial<wpStore> = {
        wp_owner_name: body.wp_owner_name,
        wp_owner_email: body.wp_owner_email,
        wp_currency: body.wp_currency,
        currency_conversion_rate:
          parseFloat(body.currency_conversion_rate) || 3.75,
        ubiqfy_currency: body.ubiqfy_currency || 'USD',
        ubiqfy_username: body.ubiqfy_username,
        wp_consumer_key: body.wp_consumer_key,
        wp_webhook_key: body.wp_webhook_key,
        ubiqfy_terminal_key: body.ubiqfy_terminal_key,
        sync_status: body.sync_status,
        // Toggle switches: 'true' when on, undefined when off
        is_active: body.is_active === 'true',
        ubiqfy_sandbox: body.ubiqfy_sandbox === 'true',
      };

      // Only allow superadmins to update protected fields
      if (req.user.isSuperadmin) {
        updateData.wp_store_url = body.wp_store_url;
        updateData.wp_store_name = body.wp_store_name;
        updateData.ubiqfy_producttypecode = body.ubiqfy_producttypecode;
        updateData.sku_prefix = body.sku_prefix || 'UBQ';
      }

      // Don't update password if it's empty (keep existing password) - available to all users
      if (body.ubiqfy_password && body.ubiqfy_password.trim() !== '') {
        updateData.ubiqfy_password = body.ubiqfy_password;
      }

      if (body.wp_consumer_secret && body.wp_consumer_secret.trim() !== '') {
        updateData.wp_consumer_secret = body.wp_consumer_secret;
      }

      await this.wpStoresService.update(id, updateData);

      // For normal users, redirect to their store page. For superadmins, redirect to stores list
      if (req.user.isSuperadmin) {
        return res.redirect('/clients?success=store_updated');
      } else {
        return res.redirect(`/store?success=store_updated`);
      }
    } catch (error) {
      console.error('Error updating store:', error);
      return res.redirect(`/clients/edit/${id}?error=failed_to_update`);
    }
  }

  @Post('toggle-status/:id')
  @UseGuards(SuperAdminGuard)
  async toggleStoreStatus(@Param('id') id: string, @Res() res) {
    try {
      const updatedStore = await this.wpStoresService.toggleActive(id);
      if (!updatedStore) {
        return res.status(404).json({ success: false, error: 'Store not found' });
      }
      const action = updatedStore.is_active ? 'activated' : 'deactivated';
      return res.json({
        success: true,
        message: `Store ${action} successfully`,
        isActive: updatedStore.is_active
      });
    } catch (error) {
      console.error('Error toggling store status:', error);
      return res.status(500).json({ success: false, error: 'Failed to update store status' });
    }
  }
}
