import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantVoucherPurchaseDetail, VoucherStatus } from './merchant-voucher-purchase-detail.entity';
import { MerchantVoucherPurchaseItem } from './merchant-voucher-purchase-item.entity';
import { MerchantVoucherPurchase, PurchaseOrderStatus } from './merchant-voucher-purchase.entity';
import { wpStoreProductOption } from '../wp-stores/wp-store-product-option.entity';
import { wpStore } from '../wp-stores/wp-stores.entity';
import { wpStoresService } from '../wp-stores/wp-stores.service';
import { ConfigService } from '@nestjs/config';

interface DoTransactionRequest {
    Token: string;
    ExternalId: string;
    ProductTypeCode: string;
    ProductOptionCode: string;
    Amount: number;
    Quantity: number;
}

interface DoTransactionResponse {
    OperationSucceeded: boolean;
    Status?: number;
    Error?: number;
    ErrorText?: string;
    PaymentResultData?: {
        ExternalId?: string;
        Product?: string;
        ResponseAmount?: number;
        AmountWholesale?: number;
        Quantity?: number;
        SerialNumber?: string;
        TransactionId?: number;
        ProviderTransactionId?: number;
        Reference?: string;
        RedeemUrl?: string;
    } | null;
}

interface wpDigitalCodesRequest {
    codes: string[];
}

interface wpDigitalCodesResponse {
    status: number;
    success: boolean;
    data: {
        message: string;
        code: number;
    };
}

interface UbiqfyAuthResponse {
    balance?: number; // Balance in cents (legacy)
    Plafond?: number; // Balance in cents (current API)
    status?: string;
    OperationSucceeded?: boolean;
    Error?: string | null;
    ErrorText?: string | null;
    Token?: string;
}

export interface ProductPricing {
    product_option_code: string;
    min_wholesale_value: number; // In currency units (not cents)
    max_wholesale_value: number; // In currency units (not cents)
    min_face_value: number; // In currency units (not cents)
    max_face_value: number; // In currency units (not cents)
}

interface UbiqfyProductOptionResponse {
    OperationSucceeded: boolean;
    Error: string | null;
    ErrorText: string | null;
    AvailableProductOption: {
        Name: string;
        ProductOptionCode: string;
        EanSkuUpc: number | null;
        Description: string;
        Logo: string | null;
        Value: number | null;
        MinMaxFaceRangeValue: {
            MinFaceValue: number;
            MaxFaceValue: number;
        };
        MinMaxRangeValue: {
            MinValue: number;
            MaxValue: number;
            MinWholesaleValue: number;
            MaxWholesaleValue: number;
        };
    };
}

@Injectable()
export class DoTransactionService {
    private readonly logger = new Logger(DoTransactionService.name);
    private readonly ubiqfyApiUrl: string;
    private readonly ubiqfyApiKey: string;

    constructor(
        @InjectRepository(MerchantVoucherPurchaseDetail)
        private purchaseDetailRepository: Repository<MerchantVoucherPurchaseDetail>,
        @InjectRepository(MerchantVoucherPurchaseItem)
        private purchaseItemRepository: Repository<MerchantVoucherPurchaseItem>,
        @InjectRepository(MerchantVoucherPurchase)
        private purchaseRepository: Repository<MerchantVoucherPurchase>,
        @InjectRepository(wpStoreProductOption)
        private wpStoreProductOptionRepository: Repository<wpStoreProductOption>,
        @InjectRepository(wpStore)
        private wpStoreRepository: Repository<wpStore>,
        private wpStoresService: wpStoresService,
        private configService: ConfigService,
    ) {
        this.ubiqfyApiUrl = this.configService.get<string>('UBIQFY_API_URL') || 'https://api.ubiqfy.com';
        this.ubiqfyApiKey = this.configService.get<string>('UBIQFY_API_KEY') || '';
    }

    /**
     * Check balance and update wholesale prices before processing
     */
    async checkBalanceAndUpdatePricing(purchaseId: string): Promise<{
        balance: number;
        sufficient: boolean;
        totalCost: number
    }> {
        this.logger.log(`Checking balance and updating pricing for purchase ${purchaseId}`);

        // Get the purchase to find the store
        const purchaseWithStore = await this.purchaseRepository.findOne({
            where: { id: purchaseId },
            relations: ['wpStore']
        });

        if (!purchaseWithStore || !purchaseWithStore.wpStore) {
            throw new Error('Purchase or associated store not found');
        }

        // Get current balance from auth endpoint using store credentials - reuse existing service
        const authResult = await this.wpStoresService.authenticateWithUbiqfy(purchaseWithStore.wpStore.id);

        this.logger.log('Auth result from wpStoresService:', {
            success: authResult.success,
            hasToken: !!authResult.token,
            plafond: authResult.plafond,
            message: authResult.message
        });

        const balance = authResult.plafond * 100; // Convert to cents for internal calculations

        // Get purchase items
        const purchaseItems = await this.purchaseItemRepository.find({
            where: { purchase_id: purchaseId }
        });

        // Update pricing for each item
        let totalCost = 0;
        for (const item of purchaseItems) {
            const pricing = await this.getProductPricing(item.product_option_code, purchaseWithStore.wpStore, authResult.token);

            // Update wholesale price (use the min_wholesale_value directly)
            const newWholesalePrice = pricing.min_wholesale_value;
            item.unit_wholesale_price = newWholesalePrice;
            item.total_wholesale_cost = item.quantity_ordered * newWholesalePrice;

            await this.purchaseItemRepository.save(item);
            totalCost += item.total_wholesale_cost;

            // Update wp_store_product_options table
            await this.updatewpStoreProductOptionPricing(item.product_option_code, pricing);
        }

        // Update purchase total cost and reset status if successful
        const purchase = await this.purchaseRepository.findOne({
            where: { id: purchaseId }
        });
        if (purchase) {
            purchase.total_wholesale_cost = totalCost;
            purchase.ubiqfy_balance_before = balance / 100; // Balance is still in cents from auth endpoint

            // Reset to PENDING status if purchase was previously failed due to balance issues
            if (purchase.status === PurchaseOrderStatus.FAILED) {
                purchase.status = PurchaseOrderStatus.PENDING;
                purchase.error_message = null; // Clear previous error
                this.logger.log(`Reset purchase ${purchaseId} from FAILED to PENDING status after successful balance check`);
            }

            await this.purchaseRepository.save(purchase);
        }

        // Check if balance is sufficient (convert totalCost to cents for comparison)
        const totalCostInCents = totalCost * 100;
        const sufficient = balance >= totalCostInCents;

        this.logger.log(`Balance check: Balance=${balance} cents, Required=${totalCostInCents} cents, Sufficient=${sufficient}`);

        return {
            balance: balance / 100, // Return in currency units
            sufficient,
            totalCost
        };
    }

    /**
     * Update wp_store_product_options with new wholesale pricing
     */
    private async updatewpStoreProductOptionPricing(
        productOptionCode: string,
        pricing: ProductPricing
    ): Promise<void> {
        try {
            // Find all wp store product options that match this product option code
            const storeOptions = await this.wpStoreProductOptionRepository.find({
                where: { option_code: productOptionCode }
            });

            for (const storeOption of storeOptions) {
                // Update wholesale price (use the min_wholesale_value directly)
                const newWholesalePriceUSD = pricing.min_wholesale_value;
                const oldWholesalePriceUSD = storeOption.original_price_usd;

                storeOption.original_price_usd = newWholesalePriceUSD;
                storeOption.wholesale_price_usd = newWholesalePriceUSD;

                // Update face value if provided
                if (pricing.min_face_value) {
                    storeOption.min_face_value = pricing.min_face_value;
                }

                // Recalculate store currency price if there's a conversion rate
                // Note: You might need to get the store info to get conversion rate
                if (storeOption.store_currency_price && oldWholesalePriceUSD > 0) {
                    const currentConversionRate = storeOption.store_currency_price / oldWholesalePriceUSD;
                    storeOption.store_currency_price = newWholesalePriceUSD * currentConversionRate;
                }

                // Recalculate markup percentage if needed
                if (storeOption.custom_price && storeOption.store_currency_price > 0) {
                    const markupAmount = storeOption.custom_price - storeOption.store_currency_price;
                    storeOption.markup_percentage = (markupAmount / storeOption.store_currency_price) * 100;
                }

                await this.wpStoreProductOptionRepository.save(storeOption);

                this.logger.log(
                    `Updated pricing for option ${productOptionCode}: ` +
                    `Old wholesale: ${oldWholesalePriceUSD} USD, ` +
                    `New wholesale: ${newWholesalePriceUSD} USD, ` +
                    `Face value: ${pricing.min_face_value}-${pricing.max_face_value} USD, ` +
                    `Markup: ${storeOption.markup_percentage}%`
                );
            }

        } catch (error) {
            this.logger.error(`Failed to update store option pricing for ${productOptionCode}:`, error);
            // Don't throw error here - pricing update failure shouldn't stop voucher processing
        }
    }

    /**
     * Public method to get balance info for testing - requires store parameter
     */
    async getUbiqfyBalanceInfo(store: any): Promise<{ balance: number; status: string }> {
        const authResult = await this.wpStoresService.authenticateWithUbiqfy(store.id);
        return {
            balance: authResult.plafond, // Already in currency units from the service
            status: 'active'
        };
    }

    /**
     * Public method to get product pricing for testing
     */
    async getProductPricingInfo(productOptionCode: string): Promise<ProductPricing> {
        // For this public method, we need to get store info somehow
        // This is a limitation - we need storeId to determine the correct API URL
        throw new Error('getProductPricingInfo method needs store information to determine correct API URL. Use the store-specific balance check instead.');
    }

    /**
     * Update pricing for all products in a store
     */
    async updateAllStorePricing(storeId: string): Promise<{ updatedCount: number }> {
        this.logger.log(`Updating pricing for all products in store ${storeId}`);

        try {
            // Get store data first for API URL determination
            const store = await this.wpStoreRepository.findOne({
                where: { id: storeId }
            });

            if (!store) {
                throw new Error(`Store ${storeId} not found`);
            }

            // Get all store product options for this store
            const storeOptions = await this.wpStoreProductOptionRepository
                .createQueryBuilder('option')
                .innerJoin('option.storeProduct', 'product')
                .innerJoin('product.wpStore', 'store')
                .where('store.id = :storeId', { storeId })
                .getMany();

            let updatedCount = 0;

            for (const storeOption of storeOptions) {
                try {
                    // Get latest pricing from Ubiqfy
                    const pricing = await this.getProductPricing(storeOption.option_code, store);

                    // Update the store option pricing
                    await this.updatewpStoreProductOptionPricing(storeOption.option_code, pricing);
                    updatedCount++;

                } catch (error) {
                    this.logger.warn(`Failed to update pricing for option ${storeOption.option_code}:`, error);
                    // Continue processing other options
                }
            }

            this.logger.log(`Successfully updated pricing for ${updatedCount} out of ${storeOptions.length} products in store ${storeId}`);

            return { updatedCount };

        } catch (error) {
            this.logger.error(`Failed to update store pricing for store ${storeId}:`, error);
            throw error;
        }
    }

    /**
     * Get current pricing for a product option
     */
    private async getProductPricing(productOptionCode: string, store: any, authToken?: string): Promise<ProductPricing> {
        try {
            this.logger.log(`Getting pricing for ${productOptionCode}, token provided: ${!!authToken}`);

            // If no token provided, get one using the working authentication method
            if (!authToken) {
                const authResult = await this.wpStoresService.authenticateWithUbiqfy(store.id);
                authToken = authResult.token;
                this.logger.log(`Got new auth token: ${!!authToken}`);
            }

            // Use the correct API URL based on store's sandbox setting
            const baseUrl = store.ubiqfy_sandbox
                ? process.env.SANDBOX_UBIQFY_URL || 'https://api-sandbox.ubiqfy.com'
                : process.env.PRODUCTION_UBIQFY_URL || 'https://api.ubiqfy.com';

            this.logger.log(`Using API URL: ${baseUrl} for pricing request`);

            const response = await fetch(`${baseUrl}/GetAvailableProductOptionByCode`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Token: authToken,
                    ProductOptionCode: productOptionCode
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to get pricing: HTTP ${response.status}`);
            }

            const apiResponse: UbiqfyProductOptionResponse = await response.json();

            if (!apiResponse.OperationSucceeded) {
                throw new Error(`API Error: ${apiResponse.ErrorText || 'Unknown error'}`);
            }

            const productOption = apiResponse.AvailableProductOption;

            return {
                product_option_code: productOptionCode,
                min_wholesale_value: productOption.MinMaxRangeValue?.MinWholesaleValue || 0,
                max_wholesale_value: productOption.MinMaxRangeValue?.MaxWholesaleValue || 0,
                min_face_value: productOption.MinMaxFaceRangeValue?.MinFaceValue || 0,
                max_face_value: productOption.MinMaxFaceRangeValue?.MaxFaceValue || 0
            };

        } catch (error) {
            this.logger.error(`Failed to get pricing for ${productOptionCode}:`, error);
            throw new Error(`Unable to get current pricing for ${productOptionCode}: ${error.message}`);
        }
    }

    /**
     * Process all pending vouchers for a purchase order
     */
    async processPurchaseOrder(purchaseId: string): Promise<void> {
        this.logger.log(`Starting DoTransaction processing for purchase ${purchaseId}`);

        try {
            // Step 1: Check balance and update pricing
            const balanceCheck = await this.checkBalanceAndUpdatePricing(purchaseId);

            if (!balanceCheck.sufficient) {
                await this.updatePurchaseStatus(purchaseId, PurchaseOrderStatus.FAILED);
                const purchase = await this.purchaseRepository.findOne({ where: { id: purchaseId } });
                if (purchase) {
                    purchase.error_message = `Insufficient balance. Required: ${balanceCheck.totalCost}, Available: ${balanceCheck.balance}`;
                    await this.purchaseRepository.save(purchase);
                }
                throw new Error('Insufficient balance to process purchase');
            }

            // Step 2: Update purchase status to PROCESSING
            await this.updatePurchaseStatus(purchaseId, PurchaseOrderStatus.PROCESSING);

            // Step 3: Get all pending voucher details
            const pendingVouchers = await this.purchaseDetailRepository.find({
                where: {
                    purchase_id: purchaseId,
                    status: VoucherStatus.PENDING
                },
                relations: ['purchaseItem']
            });

            let successCount = 0;
            let failureCount = 0;

            // Step 4: Process each voucher
            for (const voucher of pendingVouchers) {
                try {
                    await this.processSingleVoucher(voucher);
                    successCount++;

                    // Add small delay to avoid rate limiting
                    if (successCount % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay every 10 vouchers
                    }
                } catch (error) {
                    this.logger.error(`Failed to process voucher ${voucher.external_id}:`, error);
                    failureCount++;
                }
            }

            // Step 5: Update final balance after processing
            const purchase = await this.purchaseRepository.findOne({
                where: { id: purchaseId },
                relations: ['wpStore']
            });
            if (purchase && purchase.wpStore) {
                const authResult = await this.wpStoresService.authenticateWithUbiqfy(purchase.wpStore.id);
                purchase.ubiqfy_balance_after = authResult.plafond; // Already in currency units
                await this.purchaseRepository.save(purchase);
            }

            // Step 6: Update final purchase status
            const finalStatus = failureCount === 0
                ? PurchaseOrderStatus.COMPLETED
                : successCount > 0
                    ? PurchaseOrderStatus.PARTIALLY_COMPLETED
                    : PurchaseOrderStatus.FAILED;

            await this.updatePurchaseStatus(purchaseId, finalStatus);
            await this.updatePurchaseCounts(purchaseId);

            // Step 7: Attach voucher codes to wp products if any vouchers were generated
            if (successCount > 0) {
                try {
                    await this.attachAllVoucherCodesTowp(purchaseId);
                    this.logger.log(`Successfully attached voucher codes to wp for purchase ${purchaseId}`);

                    // Log navigation suggestion for UI
                    const purchase = await this.purchaseRepository.findOne({
                        where: { id: purchaseId },
                        relations: ['wpStore']
                    });
                    if (purchase && purchase.wpStore) {
                        this.logger.log(`✅ Voucher processing completed! Navigate to stock page: /clients/stock/${purchase.wpStore.id}`);

                        // Update purchase with navigation info
                        purchase.success_message = `${successCount} vouchers generated and synced to wp. View updated stock levels.`;
                        purchase.navigation_url = `/clients/stock/${purchase.wpStore.id}`;
                        await this.purchaseRepository.save(purchase);
                    }

                } catch (wpError) {
                    this.logger.error(`Failed to attach codes to wp for purchase ${purchaseId}:`, wpError);
                    // Don't fail the entire process if wp attachment fails - vouchers are already generated
                }
            }

            this.logger.log(`DoTransaction processing completed for purchase ${purchaseId}. Success: ${successCount}, Failed: ${failureCount}`);

        } catch (error) {
            this.logger.error(`Purchase processing failed for ${purchaseId}:`, error);

            // Log detailed error for debugging
            const purchase = await this.purchaseRepository.findOne({ where: { id: purchaseId } });
            if (purchase) {
                purchase.error_message = `Processing failed: ${error.message}`;
                await this.purchaseRepository.save(purchase);
            }

            await this.updatePurchaseStatus(purchaseId, PurchaseOrderStatus.FAILED);
            throw error;
        }
    }

    /**
     * Process a single voucher through DoTransaction API
     */
    private async processSingleVoucher(voucher: MerchantVoucherPurchaseDetail): Promise<void> {
        // Update status to PROCESSING
        voucher.status = VoucherStatus.PROCESSING;
        voucher.request_sent_at = new Date();
        await this.purchaseDetailRepository.save(voucher);

        const startTime = Date.now();

        try {
            // Get store information and authenticate with Ubiqfy
            const purchase = await this.purchaseRepository.findOne({
                where: { id: voucher.purchase_id },
                relations: ['wpStore']
            });

            if (!purchase || !purchase.wpStore) {
                throw new Error('Purchase or associated store not found for voucher processing');
            }

            // Use wpStoresService for authentication to get both URL and token
            const { baseUrl, token } = await this.wpStoresService.authenticateWithUbiqfy(purchase.wpStore.id);

            console.log(`DoTransaction - Using ${baseUrl} with store authentication for voucher ${voucher.external_id}`);

            // Prepare request with correct API format
            const request: DoTransactionRequest = {
                Token: token,
                ExternalId: voucher.external_id,
                ProductTypeCode: "Voucher",
                ProductOptionCode: voucher.purchaseItem.product_option_code,
                Amount: voucher.purchaseItem.unit_face_value || 0, // Use the face value, not wholesale price
                Quantity: 1
            };

            console.log('DoTransaction Request Body:', JSON.stringify(request, null, 2));
            console.log('Voucher Details:', {
                external_id: voucher.external_id,
                purchase_item_id: voucher.purchase_item_id,
                product_option_code: voucher.purchaseItem?.product_option_code,
                purchaseItem: voucher.purchaseItem
            });

            // Call Ubiqfy DoTransaction API with correct authentication
            const response = await fetch(`${baseUrl}/dotransaction`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('DoTransaction HTTP Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText: errorText
                });
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const responseData: DoTransactionResponse = await response.json();
            console.log('DoTransaction Response:', JSON.stringify(responseData, null, 2));

            const responseTime = Date.now() - startTime;
            await this.handleDoTransactionResponse(voucher, responseData, responseTime);

        } catch (error) {
            const responseTime = Date.now() - startTime;
            await this.handleDoTransactionError(voucher, error, responseTime);
            throw error;
        }
    }

    /**
     * Handle successful DoTransaction response
     */
    private async handleDoTransactionResponse(
        voucher: MerchantVoucherPurchaseDetail,
        response: DoTransactionResponse,
        responseTime: number
    ): Promise<void> {
        voucher.response_received_at = new Date();
        voucher.response_time_ms = responseTime;
        voucher.ubiqfy_response = response;

        if (response.OperationSucceeded) {
            voucher.status = VoucherStatus.GENERATED;
            voucher.operation_succeeded = true;

            // Extract data from PaymentResultData if available
            const resultData = response.PaymentResultData;
            if (resultData) {
                voucher.response_amount = resultData.ResponseAmount || null;
                voucher.amount_wholesale = resultData.AmountWholesale || null;
                voucher.serial_number = resultData.SerialNumber || null;
                voucher.transaction_id = resultData.TransactionId || null;
                voucher.provider_transaction_id = resultData.ProviderTransactionId || null;
                voucher.reference = resultData.Reference || null;
                voucher.redeem_url = resultData.RedeemUrl || null;
            }
            voucher.processed_at = new Date();

            this.logger.log(`Voucher ${voucher.external_id} generated successfully`);
        } else {
            voucher.status = VoucherStatus.FAILED;
            voucher.operation_succeeded = false;
            voucher.error_text = response.ErrorText || 'Unknown error';
            voucher.processed_at = new Date();

            this.logger.error(`Voucher ${voucher.external_id} failed: ${response.ErrorText}`);
        }

        await this.purchaseDetailRepository.save(voucher);
    }

    /**
     * Handle DoTransaction API errors
     */
    private async handleDoTransactionError(
        voucher: MerchantVoucherPurchaseDetail,
        error: any,
        responseTime: number
    ): Promise<void> {
        voucher.response_received_at = new Date();
        voucher.response_time_ms = responseTime;
        voucher.status = VoucherStatus.FAILED;
        voucher.operation_succeeded = false;
        voucher.error_text = error.message || 'API call failed';
        voucher.processed_at = new Date();
        voucher.retry_count += 1;

        await this.purchaseDetailRepository.save(voucher);
    }

    /**
     * Update purchase order status
     */
    private async updatePurchaseStatus(purchaseId: string, status: PurchaseOrderStatus): Promise<void> {
        const purchase = await this.purchaseRepository.findOne({ where: { id: purchaseId } });
        if (!purchase) return;

        purchase.status = status;

        if (status === PurchaseOrderStatus.PROCESSING) {
            purchase.processing_started_at = new Date();
        } else if ([
            PurchaseOrderStatus.COMPLETED,
            PurchaseOrderStatus.PARTIALLY_COMPLETED,
            PurchaseOrderStatus.FAILED
        ].includes(status)) {
            purchase.processing_completed_at = new Date();
        }

        await this.purchaseRepository.save(purchase);
    }

    /**
     * Update purchase voucher counts
     */
    private async updatePurchaseCounts(purchaseId: string): Promise<void> {
        const generatedCount = await this.purchaseDetailRepository
            .createQueryBuilder('detail')
            .select('COUNT(*)', 'count')
            .where('detail.purchase_id = :purchaseId', { purchaseId })
            .andWhere('detail.status = :status', { status: VoucherStatus.GENERATED })
            .getRawOne();

        const failedCount = await this.purchaseDetailRepository
            .createQueryBuilder('detail')
            .select('COUNT(*)', 'count')
            .where('detail.purchase_id = :purchaseId', { purchaseId })
            .andWhere('detail.status = :status', { status: VoucherStatus.FAILED })
            .getRawOne();

        const purchase = await this.purchaseRepository.findOne({ where: { id: purchaseId } });
        if (purchase) {
            purchase.total_vouchers_generated = parseInt(generatedCount?.count || '0') || 0;
            purchase.total_vouchers_failed = parseInt(failedCount?.count || '0') || 0;
            await this.purchaseRepository.save(purchase);
        }
    }

    /**
     * Retry failed vouchers
     */
    async retryFailedVouchers(purchaseId: string): Promise<void> {
        this.logger.log(`Retrying failed vouchers for purchase ${purchaseId}`);

        const failedVouchers = await this.purchaseDetailRepository.find({
            where: {
                purchase_id: purchaseId,
                status: VoucherStatus.FAILED
            },
            relations: ['purchaseItem']
        });

        for (const voucher of failedVouchers) {
            if (voucher.retry_count < 3) { // Max 3 retries
                try {
                    await this.processSingleVoucher(voucher);
                } catch (error) {
                    this.logger.error(`Retry failed for voucher ${voucher.external_id}:`, error);
                }
            }
        }

        await this.updatePurchaseCounts(purchaseId);
    }

    /**
     * Attach voucher codes to wp product after successful DoTransaction
     */
    private async attachVoucherCodesTowpProduct(
        purchaseId: string,
        wpProductId: string,
        voucherCodes: string[]
    ): Promise<void> {
        try {
            // Get the purchase to find the store
            const purchase = await this.purchaseRepository.findOne({
                where: { id: purchaseId },
                relations: ['wpStore']
            });

            if (!purchase || !purchase.wpStore) {
                throw new Error('Purchase or associated store not found for wp attachment');
            }

            const store = purchase.wpStore;

            // Prepare the request body
            const requestBody: wpDigitalCodesRequest = {
                codes: voucherCodes
            };

            // Make the API call to wp
            // Fetch digital codes from wp
            const response = await fetch(`${process.env.wp_BASE_URL || 'https://api.wp.dev/admin/v2'}/products/${wpProductId}/digital-codes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${store.wp_access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`wp API Error: HTTP ${response.status} - ${errorText}`);
            }

            const responseData: wpDigitalCodesResponse = await response.json();

            if (!responseData.success) {
                throw new Error(`wp API failed: ${responseData.data?.message || 'Unknown error'}`);
            }

            this.logger.log(`Successfully attached ${voucherCodes.length} codes to wp product ${wpProductId}`);
            console.log('wp Digital Codes Response:', JSON.stringify(responseData, null, 2));

            // Flag vouchers as synced to wp and update stock
            await this.flagVouchersAsSyncedTowp(purchaseId, wpProductId, voucherCodes);

        } catch (error) {
            this.logger.error(`Failed to attach codes to wp product ${wpProductId}:`, error);
            throw error;
        }
    }

    /**
     * Flag vouchers as synced to wp and refresh stock levels
     */
    private async flagVouchersAsSyncedTowp(
        purchaseId: string,
        wpProductId: string,
        voucherCodes: string[]
    ): Promise<void> {
        try {
            // Flag vouchers as synced to wp
            await this.purchaseDetailRepository
                .createQueryBuilder()
                .update(MerchantVoucherPurchaseDetail)
                .set({
                    wp_synced: true,
                    wp_synced_at: new Date()
                })
                .where('purchase_id = :purchaseId', { purchaseId })
                .andWhere('reference IN (:...codes)', { codes: voucherCodes })
                .execute();

            // Update stock levels in wp_store_product_options
            await this.refreshStockLevels(wpProductId, voucherCodes.length);

            this.logger.log(`Flagged ${voucherCodes.length} vouchers as synced to wp and updated stock for product ${wpProductId}`);

        } catch (error) {
            this.logger.error(`Failed to flag vouchers as synced or update stock for product ${wpProductId}:`, error);
            // Don't throw - this is a secondary operation
        }
    }

    /**
     * Refresh stock levels after voucher codes are attached to wp
     */
    private async refreshStockLevels(wpProductId: string, quantityAdded: number): Promise<void> {
        try {
            // Update stock levels in wp_store_product_options table
            const storeOptions = await this.wpStoreProductOptionRepository.find({
                where: { wp_product_id: wpProductId }
            });

            for (const storeOption of storeOptions) {
                // Increase available stock by the number of vouchers added
                const currentStock = storeOption.stock_quantity || 0;
                const newStock = currentStock + quantityAdded;

                storeOption.stock_quantity = newStock;
                storeOption.last_stock_update = new Date();

                await this.wpStoreProductOptionRepository.save(storeOption);

                this.logger.log(`Updated stock for product option ${storeOption.option_code}: ${currentStock} → ${newStock} (+${quantityAdded})`);
            }

        } catch (error) {
            this.logger.error(`Failed to refresh stock levels for wp product ${wpProductId}:`, error);
            throw error;
        }
    }

    /**
     * Process completed purchase and attach all voucher codes to wp
     */
    async attachAllVoucherCodesTowp(purchaseId: string): Promise<void> {
        this.logger.log(`Starting wp attachment for purchase ${purchaseId}`);

        try {
            // Get all successfully generated vouchers for this purchase
            const generatedVouchers = await this.purchaseDetailRepository.find({
                where: {
                    purchase_id: purchaseId,
                    status: VoucherStatus.GENERATED
                },
                relations: ['purchaseItem']
            });

            if (generatedVouchers.length === 0) {
                this.logger.warn(`No generated vouchers found for purchase ${purchaseId}`);
                return;
            }

            // Group vouchers by wp product ID
            const vouchersByProduct = new Map<string, string[]>();

            for (const voucher of generatedVouchers) {
                if (voucher.reference) { // Only process vouchers that have a reference code
                    // Get wp product ID from wp_store_product_options table
                    const storeProductOption = await this.wpStoreProductOptionRepository.findOne({
                        where: { option_code: voucher.purchaseItem.product_option_code }
                    });

                    if (storeProductOption?.wp_product_id) {
                        const wpProductId = storeProductOption.wp_product_id;

                        if (!vouchersByProduct.has(wpProductId)) {
                            vouchersByProduct.set(wpProductId, []);
                        }
                        vouchersByProduct.get(wpProductId)!.push(voucher.reference);

                        this.logger.log(`Found wp product ID ${wpProductId} for voucher ${voucher.external_id} with code ${voucher.reference}`);
                    } else {
                        this.logger.warn(`No wp product ID found in wp_store_product_options for product_option_code ${voucher.purchaseItem.product_option_code}`);
                    }
                } else {
                    this.logger.warn(`No reference code found for voucher ${voucher.external_id}`);
                }
            }

            // Attach codes to each wp product
            for (const [wpProductId, codes] of vouchersByProduct) {
                this.logger.log(`Attaching ${codes.length} codes to wp product ${wpProductId}: ${codes.join(', ')}`);
                await this.attachVoucherCodesTowpProduct(purchaseId, wpProductId, codes);
            }

            this.logger.log(`Completed wp attachment for purchase ${purchaseId}. Processed ${vouchersByProduct.size} products with ${generatedVouchers.length} total vouchers.`);

        } catch (error) {
            this.logger.error(`Failed to attach voucher codes to wp for purchase ${purchaseId}:`, error);
            throw error;
        }
    }

    /**
     * Get stock information with voucher tracking for a store
     */
    async getStoreStockInfo(storeId: string): Promise<{
        totalProducts: number;
        totalVoucherStock: number;
        productOptions: Array<{
            id: string;
            option_code: string;
            option_name: string;
            wp_product_id: string;
            stock_quantity: number;
            stock_level: number;
            last_stock_update: Date;
            recently_synced_count: number;
        }>;
    }> {
        try {
            // Get all product options for this store with stock information
            const productOptions = await this.wpStoreProductOptionRepository
                .createQueryBuilder('option')
                .innerJoin('option.storeProduct', 'product')
                .innerJoin('product.wpStore', 'store')
                .leftJoin('merchant_voucher_purchase_details', 'voucher',
                    'voucher.purchase_item_id IN (SELECT item.id FROM merchant_voucher_purchase_items item WHERE item.product_option_code = option.option_code) AND voucher.wp_synced = true AND voucher.wp_synced_at > :recentDate'
                )
                .select([
                    'option.id as option_id',
                    'option.option_code as option_code',
                    'option.option_name as option_name',
                    'option.wp_product_id as wp_product_id',
                    'option.stock_quantity as stock_quantity',
                    'option.stock_level as stock_level',
                    'option.last_stock_update as last_stock_update',
                    'COUNT(voucher.id) as recently_synced_count'
                ])
                .where('store.id = :storeId', { storeId })
                .setParameter('recentDate', new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
                .groupBy('option.id, option.option_code, option.option_name, option.wp_product_id, option.stock_quantity, option.stock_level, option.last_stock_update')
                .getRawMany();

            const totalVoucherStock = productOptions.reduce((sum, option) => sum + (parseInt(option.stock_quantity) || 0), 0);

            return {
                totalProducts: productOptions.length,
                totalVoucherStock,
                productOptions: productOptions.map(option => ({
                    id: option.option_id,
                    option_code: option.option_code,
                    option_name: option.option_name,
                    wp_product_id: option.wp_product_id,
                    stock_quantity: parseInt(option.stock_quantity) || 0,
                    stock_level: parseInt(option.stock_level) || 0,
                    last_stock_update: option.last_stock_update,
                    recently_synced_count: parseInt(option.recently_synced_count) || 0
                }))
            };

        } catch (error) {
            this.logger.error(`Failed to get stock info for store ${storeId}:`, error);
            throw error;
        }
    }
}
