import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Village API - All India Villages Database',
      version: '1.0.0',
      description: `Complete API for accessing 619,225 villages across India with hierarchical geographic data, automated analytics, and webhook integrations.
      
## Features
- 📍 **Geographic Data**: Complete hierarchy (States → Districts → Sub-districts → Villages)
- ⚡ **Lightning Fast**: Cached responses under 100ms with Redis
- 🔍 **Smart Search**: Full-text search and autocomplete across all villages
- 📊 **Analytics**: Real-time usage tracking and detailed metrics
- 🔔 **Webhooks**: Event-driven notifications for important events
- 💳 **Payments**: Stripe integration with 4 pricing tiers
- 👥 **Team Management**: Collaborate with team members
- 🔐 **Secure**: API key authentication with rate limiting

## Authentication
- **API Keys**: Use \`X-API-Key\` header for village data endpoints
- **Write Operations**: Include \`X-API-Secret\` for non-GET API operations
- **JWT Tokens**: Use \`Bearer\` token for admin and B2B endpoints

## Rate Limits
- **FREE**: 5,000 requests/day
- **PREMIUM**: 50,000 requests/day
- **PRO**: 300,000 requests/day
- **UNLIMITED**: 1,000,000 requests/day

## Response Format
All successful responses follow this format:
\`\`\`json
{
  "success": true,
  "count": 1,
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "responseTime": 45,
    "rateLimit": {
      "remaining": 999,
      "limit": 1000,
      "reset": "2024-01-01T23:59:59Z",
      "usagePercentage": 0
    }
  }
}
\`\`\``,
      contact: {
        name: 'Village API Support',
        email: 'support@villageapi.com',
        url: 'https://villageapi.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/v1/',
        description: 'Local server',
      },
      {
        url: 'https://staging-api.villageapi.com/v1/',
        description: 'Staging server',
      },
      {
        url: 'https://api.villageapi.com/v1/',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Authentication', description: 'User authentication and registration' },
      { name: 'Village Data', description: 'Village, district, and state data endpoints' },
      { name: 'Search', description: 'Search and autocomplete endpoints' },
      { name: 'B2B Dashboard', description: 'Business dashboard and API key management' },
      { name: 'Analytics', description: 'Usage analytics and reporting' },
      { name: 'Payments', description: 'Subscription and payment management' },
      { name: 'Webhooks', description: 'Webhook endpoint management' },
      { name: 'Teams', description: 'Team collaboration features' },
      { name: 'Admin', description: 'Admin-only management endpoints' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for accessing village data endpoints. Get your API key from the B2B dashboard.',
        },
        ApiSecretAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Secret',
          description: 'Required for write operations. Never expose this secret in frontend code.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for admin and B2B endpoints. Obtain from /admin/login.',
        },
      },
      schemas: {
        // Core Models
        State: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            code: { type: 'string', example: 'AP' },
            name: { type: 'string', example: 'Andhra Pradesh' },
          },
        },
        District: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            code: { type: 'string', example: '501' },
            name: { type: 'string', example: 'Anantapur' },
            stateId: { type: 'integer', example: 1 },
          },
        },
        SubDistrict: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            code: { type: 'string', example: '501001' },
            name: { type: 'string', example: 'Anantapur' },
            districtId: { type: 'integer', example: 1 },
          },
        },
        Village: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            code: { type: 'string', example: '501001001' },
            name: { type: 'string', example: 'Adivi Thanda' },
            subDistrictId: { type: 'integer', example: 1 },
          },
        },
        VillageWithHierarchy: {
          type: 'object',
          properties: {
            value: { type: 'string', example: 'village_id_501001001' },
            label: { type: 'string', example: 'Adivi Thanda' },
            fullAddress: { type: 'string', example: 'Adivi Thanda, Anantapur, Anantapur, Andhra Pradesh, India' },
            hierarchy: {
              type: 'object',
              properties: {
                village: { type: 'string' },
                subDistrict: { type: 'string' },
                district: { type: 'string' },
                state: { type: 'string' },
                country: { type: 'string' },
              },
            },
          },
        },

        // User Models
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            email: { type: 'string', format: 'email', example: 'business@example.com' },
            businessName: { type: 'string', example: 'Tech Solutions Pvt Ltd' },
            phone: { type: 'string', example: '+919876543210' },
            gstNumber: { type: 'string', example: '22AAAAA0000A1Z' },
            planType: { type: 'string', enum: ['FREE', 'PREMIUM', 'PRO', 'UNLIMITED'], example: 'PREMIUM' },
            status: { type: 'string', enum: ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'], example: 'ACTIVE' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        UserRegistration: {
          type: 'object',
          required: ['email', 'businessName', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'business@example.com' },
            businessName: { type: 'string', example: 'Tech Solutions Pvt Ltd' },
            phone: { type: 'string', example: '+919876543210' },
            gstNumber: { type: 'string', example: '22AAAAA0000A1Z' },
            password: {
              type: 'string', format: 'password', minLength: 8, example: 'SecurePass123!',
            },
          },
        },
        UserLogin: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@villageapi.com' },
            password: { type: 'string', format: 'password', example: 'password123' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                user: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },

        // API Key Models
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Production Key' },
            key: { type: 'string', example: 'ak_abc123def456...' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ApiKeyCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Production Key' },
          },
        },
        ApiKeyCreateResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
                key: { type: 'string' },
                secret: { type: 'string' },
                warning: { type: 'string' },
              },
            },
          },
        },

        // Subscription Models
        Subscription: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            planType: { type: 'string', enum: ['FREE', 'PREMIUM', 'PRO', 'UNLIMITED'] },
            status: { type: 'string', enum: ['ACTIVE', 'CANCELED', 'PAST_DUE'] },
            currentPeriodStart: { type: 'string', format: 'date-time' },
            currentPeriodEnd: { type: 'string', format: 'date-time' },
            cancelAtPeriodEnd: { type: 'boolean' },
          },
        },
        CreateSubscription: {
          type: 'object',
          required: ['planType', 'paymentMethodId'],
          properties: {
            planType: { type: 'string', enum: ['PREMIUM', 'PRO', 'UNLIMITED'] },
            paymentMethodId: { type: 'string', example: 'pm_card_visa' },
            trialDays: { type: 'integer', default: 0, example: 14 },
          },
        },

        // Invoice Models
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            invoiceNumber: { type: 'string', example: 'INV-20240101-001' },
            amount: { type: 'number', example: 49.00 },
            tax: { type: 'number', example: 0.00 },
            total: { type: 'number', example: 49.00 },
            status: { type: 'string', enum: ['PAID', 'UNPAID', 'VOID'] },
            issuedAt: { type: 'string', format: 'date-time' },
            dueDate: { type: 'string', format: 'date-time' },
            paidAt: { type: 'string', format: 'date-time', nullable: true },
            pdfUrl: { type: 'string', nullable: true },
          },
        },

        // Analytics Models
        DashboardStats: {
          type: 'object',
          properties: {
            plan: { type: 'string' },
            dailyLimit: { type: 'integer' },
            todayUsage: { type: 'integer' },
            totalRequests: { type: 'integer' },
            avgResponseTime: { type: 'integer' },
            successRate: { type: 'integer' },
            chartData: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  requests: { type: 'integer' },
                },
              },
            },
          },
        },
        AnalyticsSummary: {
          type: 'object',
          properties: {
            period: { type: 'string' },
            totalRequests: { type: 'integer' },
            avgResponseTime: { type: 'integer' },
            successRate: { type: 'number' },
            p95ResponseTime: { type: 'integer' },
            p99ResponseTime: { type: 'integer' },
          },
        },

        // Webhook Models
        WebhookEndpoint: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateWebhook: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri', example: 'https://myapp.com/webhook' },
            events: {
              type: 'array',
              items: { type: 'string', enum: ['user.approved', 'payment.received', 'api_key.created', 'quota.warning'] },
              default: ['*'],
            },
            description: { type: 'string', example: 'Production webhook' },
          },
        },

        // Team Models
        Team: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            ownerId: { type: 'integer' },
            memberCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        TeamInvite: {
          type: 'object',
          required: ['email', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['ADMIN', 'MEMBER', 'VIEWER'] },
          },
        },

        // Error Models
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'RATE_LIMITED' },
                message: { type: 'string', example: 'Daily quota exceeded' },
              },
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Email and password required' },
          },
        },

        // Response Wrappers
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            count: { type: 'integer' },
            data: { type: 'object' },
            meta: {
              type: 'object',
              properties: {
                requestId: { type: 'string' },
                responseTime: { type: 'integer' },
                rateLimit: {
                  type: 'object',
                  properties: {
                    remaining: { type: 'integer' },
                    limit: { type: 'integer' },
                    reset: { type: 'string' },
                    usagePercentage: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            count: { type: 'integer' },
            total: { type: 'integer' },
            page: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
      },
      parameters: {
        pageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number for pagination',
          schema: { type: 'integer', default: 1, minimum: 1 },
        },
        limitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          schema: {
            type: 'integer', default: 100, minimum: 1, maximum: 500,
          },
        },
        daysParam: {
          name: 'days',
          in: 'query',
          description: 'Number of days to look back',
          schema: {
            type: 'integer', default: 30, minimum: 1, maximum: 90,
          },
        },
        periodParam: {
          name: 'period',
          in: 'query',
          description: 'Time period for analytics',
          schema: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'], default: 'monthly' },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication information is missing or invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'INVALID_API_KEY', message: 'API key missing' },
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Access denied',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'ACCESS_DENIED', message: 'Account not active' },
              },
            },
          },
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'RATE_LIMITED', message: 'Daily quota exceeded' },
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: { code: 'NOT_FOUND', message: 'State not found' },
              },
            },
          },
        },
        ValidationErrorResponse: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationError' },
            },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  apis: ['./api/server.js', './api/routes/*.js'],
};

export const specs = swaggerJsdoc(options);

// Export additional Swagger configuration helpers
export const swaggerConfig = {
  options,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .scheme-container { display: none }
    .swagger-ui .info .title { color: #3b82f6 }
    .swagger-ui .btn.authorize { border-color: #3b82f6; color: #3b82f6 }
    .swagger-ui .btn.authorize:hover { background: #3b82f6; color: white }
  `,
  customSiteTitle: 'Village API Documentation',
  customfavIcon: '/favicon.ico',
};

// Generate markdown documentation from OpenAPI spec
export function generateMarkdownDocs() {
  return `# Village API Documentation

## Overview
Complete API for accessing 619,225 villages across India with hierarchical geographic data.

## Authentication
- **API Keys**: Include \`X-API-Key: your_api_key\` in headers
- **API Secret**: Include \`X-API-Secret: your_api_secret\` for write operations
- **JWT Tokens**: Include \`Authorization: Bearer your_jwt_token\` for admin endpoints

## Base URLs
- Local: \`http://localhost:3000/v1/\`
- Staging: \`https://staging-api.villageapi.com/v1/\`
- Production: \`https://api.villageapi.com/v1/\`

## Rate Limits
| Plan | Daily Limit |
|------|------------|
| FREE | 5,000 |
| PREMIUM | 50,000 |
| PRO | 300,000 |
| UNLIMITED | 1,000,000 |

## Endpoints

### Geographic Data
- \`GET /v1/states\` - List all states
- \`GET /v1/states/{id}/districts\` - Get districts by state
- \`GET /v1/districts/{id}/subdistricts\` - Get sub-districts by district
- \`GET /v1/subdistricts/{id}/villages\` - Get villages by sub-district

### Search
- \`GET /v1/search?q={query}\` - Search villages
- \`GET /v1/autocomplete?q={query}\` - Autocomplete suggestions

### Authentication
- \`POST /auth/register\` - Register new account
- \`POST /admin/login\` - Admin login
- \`POST /auth/refresh\` - Refresh access token
- \`POST /auth/logout\` - Logout

### B2B Dashboard
- \`GET /b2b/dashboard\` - Dashboard statistics
- \`GET /b2b/apikeys\` - List API keys
- \`POST /b2b/apikeys\` - Create API key
- \`DELETE /b2b/apikeys/{id}\` - Revoke API key

### Analytics
- \`GET /b2b/analytics/summary\` - Usage summary
- \`GET /b2b/analytics/endpoints\` - Per-endpoint stats
- \`GET /b2b/analytics/trends\` - Usage trends
- \`GET /b2b/analytics/cost-projection\` - Cost projection

### Payments
- \`GET /payments/plans\` - List plans
- \`POST /payments/create-subscription\` - Create subscription
- \`POST /payments/cancel-subscription\` - Cancel subscription
- \`GET /payments/invoices\` - List invoices

### Webhooks
- \`GET /webhooks\` - List webhooks
- \`POST /webhooks\` - Create webhook
- \`DELETE /webhooks/{id}\` - Delete webhook
- \`GET /webhooks/{id}/deliveries\` - Get delivery logs

### Teams
- \`GET /teams\` - List teams
- \`POST /teams\` - Create team
- \`POST /teams/invite\` - Invite member
- \`GET /teams/members\` - List members

### Admin
- \`GET /admin/users\` - List users
- \`PATCH /admin/users/{id}/approve\` - Approve user
- \`PATCH /admin/users/{id}/plan\` - Update plan
- \`GET /admin/analytics\` - Platform analytics
- \`GET /admin/logs\` - API logs

## Error Codes
| Code | Description |
|------|-------------|
| INVALID_API_KEY | API key missing or invalid |
| ACCESS_DENIED | Account not active |
| RATE_LIMITED | Daily quota exceeded |
| NOT_FOUND | Resource not found |
| TOKEN_EXPIRED | JWT token expired |
| INTERNAL_ERROR | Internal server error |

## Support
- Email: support@villageapi.com
- Documentation: https://api.villageapi.com/docs
- Status: https://status.villageapi.com
`;
}
