# WooCommerce-Ubiqfy Integration Platform

<p align="center">
  <img src="public/images/ubiqfy_logo.jpg" width="200" alt="Ubiqfy Logo" />
</p>

<p align="center">
  A comprehensive enterprise-grade integration platform connecting <strong>WooCommerce</strong> e-commerce stores with <strong>Ubiqfy</strong> voucher services, enabling merchants to sell digital vouchers through their online stores with advanced security and automation features.
</p>

## 🌟 Overview

This NestJS-based web application serves as a secure bridge between WooCommerce e-commerce platform and Ubiqfy's voucher distribution system. It provides a complete solution for WooCommerce store owners to seamlessly integrate, manage, and sell digital vouchers from Ubiqfy's catalog directly through their stores with enterprise-level security and automation.

## ✨ Key Features

### � **Security & Authentication**
- **Multi-role authentication** (Superadmin/Store Users) with JWT
- **AES-256-GCM password encryption** for sensitive Ubiqfy credentials
- **bcrypt password hashing** for user authentication with salt rounds
- **Automatic password migration** from plain text to encrypted format
- **Store-specific access control** with role-based permissions
- **Secure API communications** with HTTPS enforcement
- **Voucher payload encryption** for serials, references, and Ubiqfy responses at rest
- **Invoice redaction** automatically masks the first half of voucher keys on generated PDFs

### 🏪 **Advanced WooCommerce Integration**
- **REST API Integration** - Direct integration with WooCommerce REST API v3
- **Intelligent authentication** with consumer key/secret management
- **Multi-store support** for enterprise users managing multiple WooCommerce sites
- **Real-time product synchronization** with automatic category mapping
- **Advanced inventory management** with stock level synchronization

### 🔌 **Robust Ubiqfy Integration**
- **Secure credential storage** with AES-256-GCM encryption
- **Real-time account balance monitoring** and validation
- **Advanced product catalog synchronization** with pricing intelligence
- **Multi-environment support** (sandbox/production) with automatic switching
- **Automatic retry mechanisms** for API failures

### 📦 **Intelligent Product Management**
- **Smart product synchronization** from Ubiqfy to wp with conflict resolution
- **Hierarchical category management** (main categories + country subcategories)
- **Advanced product option handling** with custom pricing and markup management
- **Bulk operations** for product linking and configuration
- **Real-time stock level synchronization** between platforms

### � **Complete Purchase Management System**
- **Advanced purchase order workflow** with multi-status tracking
- **Real-time balance validation** before processing
- **Automated voucher generation** and delivery via DoTransaction API
- **Professional invoice generation** with detailed breakdowns
- **Comprehensive audit logging** for all transactions
- **Failed transaction retry mechanisms** with intelligent error handling
- **Automatic key masking** so printed invoices only display the trailing half of voucher codes

### 🌐 **Enterprise Store Management**
- **Comprehensive store configuration** with encrypted credential storage
- **Real-time API connectivity testing** and validation
- **Advanced product catalog synchronization** from Ubiqfy to WooCommerce
- **Intelligent pricing management** with markup and profit calculations
- **Automated stock level updates** between platforms

### 👥 **Advanced User Management**
- **Role-based access control** (Superadmin/Store Users)
- **Store-specific user assignment** and access restrictions
- **Secure password management** with change functionality
- **User activity monitoring** and session management

### 🎨 **Modern User Interface**
- **Responsive web design** with Bootstrap 5
- **Real-time updates** and notifications
- **Intuitive navigation** with breadcrumb support
- **Professional dashboards** for different user roles
- **Mobile-optimized** interface for on-the-go management

### Technology Stack
- **Framework**: NestJS with TypeScript for robust backend architecture
- **Database**: MySQL with TypeORM for reliable data persistence
- **Authentication**: JWT-based authentication with Passport.js
- **Security**: AES-256-GCM encryption for sensitive data
- **Frontend**: Server-side rendered EJS templates with modern CSS/JavaScript
- **Real-time Processing**: Webhook-based event system with intelligent error handling

### Security Architecture
- **Data Encryption**: AES-256-GCM for sensitive credentials with random IV generation
- **Password Hashing**: bcrypt with salt rounds for user authentication
- **Authentication**: Multi-layer JWT with refresh tokens and role-based access control
- **API Security**: HTTPS enforcement, rate limiting, input validation and sanitization
- **Database Security**: Encrypted connections, parameterized queries, audit logging

### Module Architecture
```
src/
├── admin/           # Administrative interface and superadmin controls
├── auth/            # JWT authentication, guards, and security middleware
├── clients/         # Store management and client-facing interfaces
├── woocommerce-stores/ # Core WooCommerce integration with REST API
├── store/           # Store-specific user interfaces and workflows
├── ubiqfy-products/ # Ubiqfy catalog management and synchronization
├── users/           # User management and role-based access control
├── utils/           # Shared utilities, encryption, and helper services
└── voucher-purchases/ # Purchase order processing and voucher generation
```

### Database Schema
```
Users (JWT auth, role management)
├── WooCommerceStores (encrypted credentials, API keys)
│   ├── WooCommerceStoreProducts (product linking)
│   └── WooCommerceStoreProductOptions (pricing, stock management)
├── UbiqfyProducts (catalog cache)
│   └── UbiqfyProductOptions (variations, pricing data)
└── VoucherPurchases (order management)
    ├── VoucherPurchaseItems (order line items)
    └── VoucherPurchaseDetails (generated voucher data)
```

### Key Workflows

#### 1. Secure Store Setup Workflow
```
Store Registration → WooCommerce API Credentials Setup →
Encrypted Credential Storage → API Authentication Test →
Ubiqfy Account Configuration → Ready for Integration
```

#### 2. Intelligent Product Sync Workflow  
```
Fetch from Ubiqfy → Apply Pricing Intelligence → Validate Categories →
Create/Update WooCommerce Products → Update Local Cache → Stock Synchronization
```

#### 3. Secure Purchase Workflow
```
Order Creation → Balance Validation → Credential Decryption →
API Authentication → DoTransaction Processing → Voucher Generation →
Stock Updates → Invoice Generation → Audit Logging
```

## 🚀 Installation & Setup

### Prerequisites
- **Node.js** (v18 or higher)
- **MySQL** (v8 or higher) - Primary database
- **WooCommerce Store** with REST API access
- **Ubiqfy API credentials** (username, password, terminal key)
- **SSL Certificate** (recommended for production)

### Security Configuration
Create a `.env` file in the root directory:

```env
# Application Configuration
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://yourdomain.com
WEBHOOK_BASE_URL=https://yourdomain.com

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password  
DB_DATABASE=wp_ubiqfy_integration
DB_SSL_ENABLED=true

# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
ENCRYPTION_KEY=your-256-bit-encryption-key-64-hex-chars

# WooCommerce API Configuration (Manual Setup Required)
WOOCOMMERCE_API_VERSION=v3

# Ubiqfy API Configuration
PRODUCTION_UBIQFY_URL=https://api.ubiqfy.com
SANDBOX_UBIQFY_URL=https://api-sandbox.ubiqfy.com
```

> **🔐 Security Note**: Generate a secure 256-bit encryption key for `ENCRYPTION_KEY`. Use `openssl rand -hex 32` to generate one.

> **🛡️ Data Protection Update (2025-10)**: Voucher serial numbers, redemption references, and raw Ubiqfy responses are encrypted at rest with AES-256-GCM using `ENCRYPTION_KEY`. Runtime responses are decrypted per request, and invoices automatically redact the first half of every voucher key.

> **📝 Important**: WooCommerce store credentials (Consumer Key/Secret) are manually configured per store through the admin interface for maximum security.

### Installation Steps

1. **Clone the repository**
```bash
git clone https://github.com/orabi2012/wp-ubiqfy-integration.git
cd wp-ubiqfy-integration
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up the database**
```bash
# Run database migrations
npm run migration:run
```

4. **Start the application**
```bash
# Development mode with hot reload
npm run start:dev

# Production mode  
npm run build
npm run start:prod
```

## ⚙️ Configuration

### WooCommerce Store Configuration

This integration uses **manual WooCommerce REST API setup** for maximum security and control:

1. **Generate WooCommerce API Credentials**:
   - Log into your WooCommerce admin dashboard
   - Navigate to **WooCommerce > Settings > Advanced > REST API**
   - Click **Add Key** and configure:
     - **Description**: "Ubiqfy Integration"
     - **User**: Select admin user
     - **Permissions**: Read/Write
     - **Generate API Key**

2. **Required API Permissions**:
   - `Products` - Read/Write access for product management
   - `Orders` - Read access for order processing
   - `Categories` - Read/Write for category organization
   - `System Status` - Read access for health checks

3. **Store Setup in Platform**:
   ```
   Admin Login → Add New Store → Enter Store Details →
   ↓
   Configure WooCommerce API Credentials → Test Connection →
   ↓
   Setup Ubiqfy Account Details → Validate & Save
   ↓
   Store Ready for Product Synchronization!
   ```

> **🎯 Key Features**: 
> - Direct REST API integration for reliable performance
> - Encrypted credential storage with AES-256-GCM
> - Real-time API connectivity testing
> - Granular permission control per store
> - Multi-store management capabilities

### Ubiqfy Integration Setup
1. **Obtain API Credentials**: Get credentials from your Ubiqfy account manager
2. **Environment Selection**: Configure sandbox/production URLs
3. **Test Authentication**: Use built-in test endpoints to verify connectivity
4. **Account Monitoring**: Set up balance alerts and monitoring

## 📋 API Reference

### Store Management Endpoints
- `GET /clients` - List all stores with status and details (Superadmin only)
- `GET /clients/add` - Add new store interface
- `POST /clients/add` - Create new store record
- `GET /clients/edit/:id` - Store management dashboard
- `POST /clients/edit/:id` - Update store settings with automatic encryption
- `POST /clients/toggle-status/:id` - Toggle store active/inactive status

### Product & Stock Management
- `GET /clients/stock/:id` - Stock management interface
- `POST /clients/stock/:id/save-levels` - Update stock levels in bulk
- `POST /clients/stock/:storeId/refresh-single` - Refresh single product stock
- `POST /clients/stock/:storeId/refresh-all` - Refresh all store stock from WooCommerce
- `GET /clients/sync/:id` - Product synchronization interface

### WooCommerce Store Integration
- `POST /woocommerce-stores/:id/test-connection` - Test WooCommerce API connectivity
- `POST /woocommerce-stores/:id/test-ubiqfy-auth` - Test Ubiqfy connection and fetch balance
- `POST /woocommerce-stores/:id/fetch-ubiqfy-products` - Fetch product catalog from Ubiqfy
- `POST /woocommerce-stores/:id/bulk-link-products` - Link multiple products to store
- `POST /woocommerce-stores/:id/sync-to-woocommerce` - Sync selected products to WooCommerce store
- `POST /woocommerce-stores/:id/verify-sync-status` - Verify synchronization status
- `GET /woocommerce-stores/:id/synced-options` - Get all synced product options
- `POST /woocommerce-stores/:id/clear-credentials` - Clear stored WooCommerce credentials

### Purchase Order Management
- `GET /voucher-purchases/purchase-orders` - Purchase orders management interface
- `GET /voucher-purchases/store/:storeId` - Get all purchases for a store
- `GET /voucher-purchases/:purchaseId` - Get purchase with details
- `POST /voucher-purchases/create/:storeId/:userId` - Create new purchase order
- `POST /voucher-purchases/:purchaseId/items` - Add items to purchase order
- `PUT /voucher-purchases/:purchaseId/items/:itemId` - Update purchase item
- `DELETE /voucher-purchases/:purchaseId/items/:itemId` - Remove purchase item
- `POST /voucher-purchases/:purchaseId/check-balance` - Validate account balance
- `POST /voucher-purchases/:purchaseId/confirm` - Confirm and process order
- `POST /voucher-purchases/:purchaseId/process` - Process voucher generation
- `POST /voucher-purchases/:purchaseId/retry-failed` - Retry failed transactions
- `GET /voucher-purchases/:purchaseId/status` - Get order status
- `DELETE /voucher-purchases/:purchaseId` - Delete purchase order

### User Management
- `GET /users` - List all users (Superadmin only)
- `GET /users/add` - Add user interface
- `POST /users/add` - Create new user
- `GET /users/edit/:id` - Edit user interface
- `POST /users/edit/:id` - Update user details
- `POST /users/toggle-status/:id` - Toggle user active/inactive status
- `GET /users/change-password` - Change password interface
- `POST /users/change-password` - Update user password

### Security & Health Endpoints
- `POST /auth/login` - User authentication
- `POST /auth/logout` - User logout
- `POST /utils/migrate-passwords` - Migrate passwords to encrypted format
- `POST /utils/verify-encryption` - Verify encryption integrity
- `GET /health` - Application health check

### Admin Management
- `GET /admin/stores` - Admin store management interface
- `GET /admin/users` - Admin user management interface

## 🎯 Usage Guide

### For Store Owners

#### 1. **Manual Store Configuration**
```
Generate WooCommerce API Keys → Add New Store in Platform → 
Enter API credentials → Test Connection → Start selling vouchers!
```

- Generate API keys from your WooCommerce admin panel
- Add a new store in the integration platform and enter the credentials
- Test the connection to ensure everything is working
- No complex setup required!

#### 2. **Product Management Made Simple**
- **Sync Products**: Navigate to "Product Sync" → "Fetch Products" → Select & Configure → "Sync to WooCommerce"
- **Pricing Control**: Set custom prices and markup percentages for each product
- **Inventory Management**: Automatic stock updates from WooCommerce with manual override capabilities
- **Category Organization**: Products automatically organized by country and category

#### 3. **Order Processing**
- **Create Orders**: Use the intuitive purchase order interface
- **Balance Monitoring**: Real-time account balance validation before processing
- **Order Tracking**: Complete order status monitoring with detailed history
- **Invoice Generation**: Professional invoices automatically generated for completed orders

#### 4. **Performance Monitoring**
- **Dashboard Analytics**: Real-time metrics on sales, inventory, and performance
- **Financial Tracking**: Detailed cost analysis and profit reporting
- **Error Monitoring**: Automatic alerts for failed transactions or sync issues

### For System Administrators

#### 1. **Multi-Store Management**
- **Store Overview**: Centralized dashboard for all connected stores
- **User Management**: Role-based access control with store assignments
- **Performance Monitoring**: Cross-store analytics and reporting
- **System Health**: Monitor webhook processing, API connectivity, and error rates

#### 2. **Security Management**
- **Password Encryption**: All sensitive credentials automatically encrypted with AES-256-GCM
- **Access Control**: Granular permissions for different user roles
- **Audit Logging**: Comprehensive audit trails for all system actions
- **Token Management**: Automatic OAuth token refresh and validation

#### 3. **System Monitoring**
- **Webhook Health**: Monitor webhook delivery and processing success rates
- **API Performance**: Track API response times and error rates
- **Database Health**: Monitor connection pools and query performance
- **Security Events**: Track login attempts, permission changes, and security incidents

## 🧪 Testing & Quality Assurance

### Test Suite
```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:cov

# Run end-to-end tests
npm run test:e2e

# Watch mode for development
npm run test:watch
```

### Security Testing
```bash
# Test password encryption
npm run test -- --testNamePattern="PasswordService"

# Test authentication flows
npm run test -- --testNamePattern="AuthGuard"

# Test webhook signature verification
npm run test -- --testNamePattern="WebhookSignature"
```

### Integration Testing
- **Ubiqfy API Integration**: Automated tests for all API endpoints
- **wp OAuth Flow**: End-to-end testing of webhook processing
- **Database Operations**: Transaction integrity and encryption verification
- **Error Handling**: Comprehensive error scenario testing

## 🚀 Deployment

### Production Deployment

#### Prerequisites
- **SSL Certificate**: Required for webhook HTTPS endpoints
- **Domain Setup**: Configured domain with DNS pointing to your server
- **Database**: Production MySQL instance with SSL
- **Environment**: Production environment variables configured

#### Deployment Steps
```bash
# 1. Build the application
npm run build

# 2. Set production environment variables
export NODE_ENV=production

# 3. Run database migrations
npm run migration:run

# 4. Start the application
npm run start:prod
```

#### Recommended Production Setup
```bash
# Using PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js

# Configure nginx reverse proxy
sudo nginx -t && sudo systemctl reload nginx

# Set up SSL with Let's Encrypt
sudo certbot --nginx -d yourdomain.com
```

### Docker Deployment
```dockerfile
# Dockerfile included in repository
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

```bash
# Build and run with Docker
docker build -t wp-ubiqfy-integration .
docker run -p 3000:3000 --env-file .env wp-ubiqfy-integration

# Or use Docker Compose
docker-compose up -d
```

### Cloud Deployment Options
- **AWS**: ECS, Elastic Beanstalk, or EC2 with RDS MySQL
- **Google Cloud**: Cloud Run with Cloud SQL MySQL
- **Azure**: Container Instances with Azure Database for MySQL
- **Digital Ocean**: App Platform with Managed MySQL Database

## 🔒 Security Considerations

### Data Protection
- **Encryption at Rest**: AES-256-GCM for sensitive credentials
- **Password Hashing**: bcrypt with salt rounds for user authentication
- **Encryption in Transit**: TLS 1.3 for all API communications
- **Database Security**: Encrypted connections and parameterized queries
- **Secret Management**: Environment variables with secure key generation

#### Voucher Data Handling
- Voucher details (serial numbers, references, redemption URLs, and Ubiqfy payloads) are stored encrypted using the platform-wide `ENCRYPTION_KEY`.
- Services decrypt values only when needed, ensuring downstream integrations (WooCommerce sync, invoice rendering) operate on in-memory plaintext.
- Generated invoices and dashboards display redacted voucher keys—the first half of each value is replaced with `X` characters to prevent disclosure if exported or printed.

### Authentication & Authorization
- **JWT Security**: Secure token generation with configurable expiration
- **Password Hashing**: bcrypt hashing with salt rounds for user passwords
- **Role-Based Access**: Granular permissions with store isolation
- **Session Management**: Automatic token refresh and invalidation
- **Multi-Factor Authentication**: Enhanced security for admin accounts

### API Security
- **Rate Limiting**: Configurable limits to prevent abuse
- **Input Validation**: Comprehensive request validation and sanitization
- **CORS Configuration**: Restricted origins for API access
- **Webhook Verification**: Signature validation for all incoming webhooks

### Monitoring & Alerting
- **Security Events**: Login attempts, permission changes, API errors
- **Performance Monitoring**: Response times, error rates, system health
- **Audit Logging**: Comprehensive logs for compliance and debugging
- **Automated Alerts**: Real-time notifications for security incidents

## 🔧 Troubleshooting

### Common Issues & Solutions

#### **Authentication Problems**
```bash
# Problem: Ubiqfy authentication fails
# Solution: Verify credentials and test connection
curl -X POST https://yourdomain.com/wp-stores/{storeId}/test-ubiqfy-auth

# Problem: JWT token expired
# Solution: Clear browser cookies and re-login

# Problem: Store access denied
# Solution: Check user role and store assignment in admin panel
```

#### **Product Synchronization Issues**
```bash
# Problem: Products not syncing to wp
# Solution: Check store authorization and webhook status
npm run test -- --testNamePattern="wpIntegration"

# Problem: Price conversions incorrect
# Solution: Verify currency conversion rates in store settings

# Problem: Stock levels not updating
# Solution: Refresh stock data manually or check wp API connectivity
```

#### **Webhook Processing Errors**
```bash
# Problem: Webhooks not receiving events
# Solution: Verify SSL certificate and webhook URL accessibility
curl -X POST https://yourdomain.com/wp-webhook/handle

# Problem: Webhook signature verification fails
# Solution: Check wp_WEBHOOK_SECRET_KEY environment variable

# Problem: App installation webhook not processed
# Solution: Check webhook registration and processing logs
```

#### **Database & Security Issues**
```bash
# Problem: Password decryption fails
# Solution: Verify ENCRYPTION_KEY is set correctly and run verification
npm run utils:verify-encryption

# Problem: Database connection errors
# Solution: Check database credentials and SSL configuration

# Problem: Migration errors
# Solution: Run migrations with verbose logging
npm run migration:run -- --verbose
```

### Performance Optimization
- **Database Indexing**: Ensure proper indexes on frequently queried fields
- **API Caching**: Implement Redis caching for frequently accessed data
- **Connection Pooling**: Configure optimal database connection pool settings
- **Memory Management**: Monitor Node.js memory usage and optimize queries

### Monitoring & Logging
```bash
# Enable debug logging
export DEBUG=wp-ubiqfy:*

# Monitor webhook processing
tail -f logs/webhook-processing.log

# Check API performance
npm run monitor:api-performance

# Database query analysis
npm run analyze:slow-queries
```

## 📚 Documentation

### Available Documentation
- **[User Manual](USER_MANUAL.md)** - Comprehensive user guide with screenshots
- **[API Documentation](docs/api.md)** - Detailed API reference and examples
- **[Webhook Events](docs/webhooks.md)** - wp webhook event handling guide
- **[Security Guide](docs/security.md)** - Security best practices and configuration
- **[Deployment Guide](docs/deployment.md)** - Production deployment instructions

### API Examples
```javascript
// Test Ubiqfy authentication
const response = await fetch('/wp-stores/{storeId}/test-ubiqfy-auth', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer {jwt_token}' }
});

// Sync products to wp
const syncResult = await fetch('/wp-stores/{storeId}/sync-to-wp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ productIds: ['prod1', 'prod2'] })
});

// Create purchase order
const order = await fetch('/voucher-purchases/create/{storeId}/{userId}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: [{ productOptionId: 'opt1', quantity: 5 }]
  })
});
```

## 🤝 Contributing

### Development Setup
```bash
# 1. Fork the repository
git clone https://github.com/yourusername/wp-ubiqfy-integration.git

# 2. Create feature branch
git checkout -b feature/amazing-feature

# 3. Install dependencies
npm install

# 4. Set up development environment
cp .env.example .env.development

# 5. Run in development mode
npm run start:dev
```

### Contribution Guidelines
1. **Code Quality**: Follow TypeScript best practices and ESLint rules
2. **Testing**: Add comprehensive tests for new features
3. **Documentation**: Update relevant documentation for changes
4. **Security**: Ensure new code follows security best practices
5. **Performance**: Consider performance implications of changes

### Code Style
```bash
# Format code with Prettier
npm run format

# Run ESLint
npm run lint

# Type checking
npm run type-check
```

### Pull Request Process
1. Update the README.md with details of changes if applicable
2. Update the User Manual for user-facing changes
3. Ensure all tests pass and coverage remains high
4. Request review from maintainers
5. Merge only after approval and successful CI/CD pipeline

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for complete details.

### License Summary
- ✅ Commercial use allowed
- ✅ Modification and distribution permitted
- ✅ Private use allowed
- ❗ License and copyright notice required
- ❗ No warranty provided

## 📞 Support & Contact

### Technical Support
- **GitHub Issues**: [Create an issue](https://github.com/orabi2012/wp-ubiqfy-integration/issues) for bugs and feature requests
- **Documentation**: Check the [User Manual](USER_MANUAL.md) for detailed guidance
- **Email Support**: For enterprise support, contact the development team

### Community
- **Discussions**: Join our [GitHub Discussions](https://github.com/orabi2012/wp-ubiqfy-integration/discussions)
- **Updates**: Follow the repository for updates and releases
- **Contributing**: See [Contributing Guidelines](#contributing) for how to help

### Enterprise Support
For enterprise customers, we offer:
- **Priority Support**: 24/7 technical assistance
- **Custom Development**: Tailored features and integrations
- **Training**: Comprehensive training for your team
- **Deployment Assistance**: Help with production deployment and optimization

## 🙏 Acknowledgments

### Open Source Technologies
- **[NestJS](https://nestjs.com/)** - Progressive Node.js framework for scalable server-side applications
- **[TypeORM](https://typeorm.io/)** - Feature-rich ORM for TypeScript and JavaScript
- **[MySQL](https://mysql.com/)** - Popular open source relational database
- **[Bootstrap](https://getbootstrap.com/)** - Popular CSS framework for responsive design

### API Partners
- **[WooCommerce](https://woocommerce.com/)** - Leading open-source e-commerce platform for WordPress
- **[Ubiqfy](https://ubiqfy.com/)** - Digital voucher and gift card services

### Contributors
Special thanks to all contributors who have helped make this project possible. See [Contributors](https://github.com/orabi2012/wp-ubiqfy-integration/contributors) for the complete list.

---

<p align="center">
  <strong>Built with ❤️ for the WordPress & WooCommerce ecosystem</strong>
</p>

<p align="center">
  <a href="#wp-ubiqfy-integration-platform">⬆️ Back to Top</a>
</p>
