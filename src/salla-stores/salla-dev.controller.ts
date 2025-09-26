import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { wpOAuthService } from './wp-oauth.service';

@Controller('dev')
export class wpDevController {
  constructor(private wpOAuthService: wpOAuthService) { }

  /**
   * Get authorization URL and instructions for manual OAuth
   * GET /dev/oauth-instructions?clientId=your_client_id
   */
  @Get('oauth-instructions')
  getOAuthInstructions(@Query('clientId') clientId: string) {
    if (!clientId) {
      return {
        error: 'Client ID is required',
        message: 'Please provide clientId as query parameter',
        example: '/dev/oauth-instructions?clientId=your_wp_client_id',
      };
    }
    return this.wpOAuthService.getDevInstructions(clientId);
  }

  /**
   * Exchange authorization code for tokens
   * POST /dev/exchange-token
   * Body: {
   *   "code": "authorization_code_from_redirect",
   *   "clientId": "your_client_id",
   *   "clientSecret": "your_client_secret"
   * }
   */
  @Post('exchange-token')
  async exchangeToken(
    @Body() body: { code: string; clientId: string; clientSecret: string },
  ) {
    const { code, clientId, clientSecret } = body;

    if (!code || !clientId || !clientSecret) {
      return {
        error: 'All fields are required: code, clientId, clientSecret',
        example: {
          code: 'paste_code_from_redirect_url_here',
          clientId: 'your_wp_client_id',
          clientSecret: 'your_wp_client_secret',
        },
      };
    }

    try {
      const tokens = await this.wpOAuthService.exchangeCodeForTokens(
        code,
        clientId,
        clientSecret,
      );
      return {
        success: true,
        tokens,
        instructions: [
          'Copy the access_token and refresh_token',
          'Use these along with clientId and clientSecret when adding your store',
          'The access_token is what you need for API calls',
        ],
      };
    } catch (error) {
      return {
        error: 'Token exchange failed',
        details: error.message,
      };
    }
  }

  /**
   * Refresh an existing token
   * POST /dev/refresh-token
   * Body: { "refresh_token": "your_refresh_token" }
   */
  @Post('refresh-token')
  async refreshToken(
    @Body()
    body: {
      refresh_token: string;
      clientId: string;
      clientSecret: string;
    },
  ) {
    const { refresh_token, clientId, clientSecret } = body;

    if (!refresh_token || !clientId || !clientSecret) {
      return {
        error: 'All fields are required: refresh_token, clientId, clientSecret',
      };
    }

    try {
      const tokens = await this.wpOAuthService.refreshToken(
        refresh_token,
        clientId,
        clientSecret,
      );
      return {
        success: true,
        tokens,
        instructions: [
          'New tokens generated!',
          'Update your store with the new access_token',
          'Save the new refresh_token for future use',
        ],
      };
    } catch (error) {
      return {
        error: 'Token refresh failed',
        details: error.message,
      };
    }
  }
}
