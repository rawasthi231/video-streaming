import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variable schema with defaults
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  
  // External service configuration
  VIDEO_PROCESSOR_URL: z.string().url().optional(),
  
  // Authentication
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  
  // Cookie settings
  COOKIE_SECRET: z.string().min(32),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_HTTP_ONLY: z.coerce.boolean().default(true),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  
  // Database Configuration - PostgreSQL
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('video_streaming'),
  POSTGRES_USER: z.string().default('video_user'),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_SSL: z.coerce.boolean().default(false),
  POSTGRES_MAX_CONNECTIONS: z.coerce.number().default(20),
  POSTGRES_CONNECTION_TIMEOUT: z.coerce.number().default(30000),
  DATABASE_URL: z.string().url().optional(),
  
  // Database Configuration - Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(""),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_MAX_RETRIES: z.coerce.number().default(3),
  REDIS_RETRY_DELAY: z.coerce.number().default(1000),
  REDIS_MAX_CONNECTIONS: z.coerce.number().default(20),
  REDIS_CONNECT_TIMEOUT: z.coerce.number().default(10000),
  REDIS_URL: z.string().optional(),
  
  // Cache Configuration
  CACHE_TTL_DEFAULT: z.coerce.number().default(3600),
  CACHE_TTL_USER_SESSION: z.coerce.number().default(86400),
  
  // Redis key prefixes
  REDIS_KEY_PREFIX: z.string().default('video_streaming:'),
  REDIS_SESSION_PREFIX: z.string().default('session:'),
  REDIS_CACHE_PREFIX: z.string().default('cache:'),
  REDIS_QUEUE_PREFIX: z.string().default('queue:'),
  
  // Security
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8080'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(1000), // Increased for load testing
  
  // Load testing / CPU burn
  BURN_DEFAULT_MS: z.coerce.number().default(200),
  BURN_MAX_MS: z.coerce.number().default(5000),
  
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs'),
  
  // Metrics
  METRICS_PORT: z.coerce.number().default(9090),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const ENV = parsedEnv.data;

// Constants derived from environment
export const CONSTANTS = {
  API_PREFIX: '/api/v1',
  HEALTH_ENDPOINTS: {
    LIVENESS: '/health',
    READINESS: '/ready',
  },
  CORS_ORIGINS: ENV.CORS_ORIGINS.split(','),
  
  // Authentication
  AUTH_ENDPOINTS: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    PROFILE: '/auth/profile',
  },
  
  // Cookie names
  COOKIES: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    USER_SESSION: 'user_session',
  },
  
  // Password validation
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  
  // Username validation
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_REGEX: /^[a-zA-Z0-9_-]+$/,
  
  // Email validation
  EMAIL_MAX_LENGTH: 254,
  
} as const;

export type Environment = typeof ENV;
