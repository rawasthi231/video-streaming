import Redis, { RedisOptions } from 'ioredis';
import { ENV } from './env.js';
import { logger } from './logger.js';

/**
 * Redis connection manager
 */
class RedisConnection {
  private client: Redis;
  private static instance: RedisConnection;

  private constructor() {
    const config: RedisOptions = {
      host: ENV.REDIS_HOST,
      port: ENV.REDIS_PORT,
      password: ENV.REDIS_PASSWORD,
      db: ENV.REDIS_DB,
      maxRetriesPerRequest: ENV.REDIS_MAX_RETRIES,
      reconnectOnError: () => true,
      connectTimeout: ENV.REDIS_CONNECT_TIMEOUT,
      lazyConnect: true,
      socketTimeout: 30000,
      keepAlive: 1,
      keyPrefix: ENV.REDIS_KEY_PREFIX,
    };

    this.client = new Redis(config);

    // Handle connection events
    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting');
    });

    this.client.on('end', () => {
      logger.warn('Redis connection ended');
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  /**
   * Get Redis client
   */
  public getClient(): Redis {
    return this.client;
  }

  /**
   * Set a key-value pair with optional TTL
   */
  public async set(
    key: string,
    value: string | number | object,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const serializedValue = typeof value === 'object' 
        ? JSON.stringify(value) 
        : String(value);

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error('Redis SET error:', { key, error });
      throw error;
    }
  }

  /**
   * Get a value by key
   */
  public async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      // Try to parse as JSON, fall back to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error('Redis GET error:', { key, error });
      throw error;
    }
  }

  /**
   * Delete a key
   */
  public async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Redis DEL error:', { key, error });
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error });
      throw error;
    }
  }

  /**
   * Set expiration for a key
   */
  public async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXPIRE error:', { key, ttlSeconds, error });
      throw error;
    }
  }

  /**
   * Get TTL for a key
   */
  public async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis TTL error:', { key, error });
      throw error;
    }
  }

  /**
   * Session-specific methods
   */
  public session = {
    /**
     * Set session data
     */
    set: async (sessionId: string, data: object, ttlSeconds?: number): Promise<void> => {
      const key = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      await this.set(key, data, ttlSeconds || ENV.CACHE_TTL_USER_SESSION);
    },

    /**
     * Get session data
     */
    get: async <T = any>(sessionId: string): Promise<T | null> => {
      const key = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      return this.get<T>(key);
    },

    /**
     * Delete session
     */
    delete: async (sessionId: string): Promise<boolean> => {
      const key = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      return this.delete(key);
    },

    /**
     * Extend session TTL
     */
    extend: async (sessionId: string, ttlSeconds?: number): Promise<boolean> => {
      const key = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      return this.expire(key, ttlSeconds || ENV.CACHE_TTL_USER_SESSION);
    },
  };

  /**
   * Cache-specific methods
   */
  public cache = {
    /**
     * Set cached data
     */
    set: async (cacheKey: string, data: object, ttlSeconds?: number): Promise<void> => {
      const key = `${ENV.REDIS_CACHE_PREFIX}${cacheKey}`;
      await this.set(key, data, ttlSeconds || ENV.CACHE_TTL_DEFAULT);
    },

    /**
     * Get cached data
     */
    get: async <T = any>(cacheKey: string): Promise<T | null> => {
      const key = `${ENV.REDIS_CACHE_PREFIX}${cacheKey}`;
      return this.get<T>(key);
    },

    /**
     * Delete cached data
     */
    delete: async (cacheKey: string): Promise<boolean> => {
      const key = `${ENV.REDIS_CACHE_PREFIX}${cacheKey}`;
      return this.delete(key);
    },

    /**
     * Clear cache by pattern
     */
    clear: async (pattern: string): Promise<number> => {
      try {
        const keys = await this.client.keys(`${ENV.REDIS_CACHE_PREFIX}${pattern}`);
        if (keys.length === 0) {
          return 0;
        }
        return await this.client.del(...keys);
      } catch (error) {
        logger.error('Redis cache clear error:', { pattern, error });
        throw error;
      }
    },
  };

  /**
   * Check Redis connection health
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Get Redis info
   */
  public async getInfo(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      logger.error('Redis info error:', error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  public async close(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const redis = RedisConnection.getInstance();

// Export Redis type for use in other modules
export type { Redis };
