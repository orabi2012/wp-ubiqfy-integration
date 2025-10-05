import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UbiqfyProductsService } from './ubiqfy-products.service';

@Controller('ubiqfy-products')
export class UbiqfyProductsController {
  constructor(private readonly ubiqfyProductsService: UbiqfyProductsService) { }

  @Get()
  async findAll(@Query('includeSandbox') includeSandbox?: string) {
    const include = includeSandbox === undefined ? true : includeSandbox === 'true';
    return await this.ubiqfyProductsService.findAllProducts(include);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const product = await this.ubiqfyProductsService.findProductById(id);
    if (!product) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }
    return product;
  }

  @Get('code/:productCode')
  async findByCode(
    @Param('productCode') productCode: string,
    @Query('isSandbox') isSandbox?: string,
  ) {
    const isSandboxFlag =
      isSandbox === undefined ? undefined : isSandbox === 'true';
    const product = await this.ubiqfyProductsService.findProductByCode(
      productCode,
      isSandboxFlag,
    );
    if (!product) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }
    return product;
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    const product = await this.ubiqfyProductsService.findProductById(id);
    if (!product) {
      throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
    }
    await this.ubiqfyProductsService.deleteProduct(id);
    return { message: 'Product deleted successfully' };
  }

  @Post('sync-from-api')
  async syncFromApi(@Body() body: { products: any[]; isSandbox?: boolean }) {
    try {
      if (
        !body.products ||
        !Array.isArray(body.products) ||
        body.products.length === 0
      ) {
        throw new HttpException(
          'Products array is required and cannot be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      const savedProducts =
        await this.ubiqfyProductsService.saveProductsFromApiResponse(
          body.products,
          body.isSandbox || false,
        );

      return {
        success: true,
        message: `Successfully saved ${savedProducts.length} products to database (${body.isSandbox ? 'sandbox' : 'production'})`,
        savedProducts: savedProducts.length,
        products: savedProducts,
      };
    } catch (error) {
      console.error('Error syncing products from API:', error);
      throw new HttpException(
        error.message || 'Failed to sync products from API',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
