import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { ENV } from './env.js';
import { logger } from './logger.js';

/**
 * PostgreSQL database connection pool
 */
class DatabaseConnection {
  private pool: Pool;
  private static instance: DatabaseConnection;

  private constructor() {
    this.pool = new Pool({
      host: ENV.POSTGRES_HOST,
      port: ENV.POSTGRES_PORT,
      database: ENV.POSTGRES_DB,
      user: ENV.POSTGRES_USER,
      password: ENV.POSTGRES_PASSWORD,
      max: ENV.POSTGRES_MAX_CONNECTIONS,
      connectionTimeoutMillis: ENV.POSTGRES_CONNECTION_TIMEOUT,
      idleTimeoutMillis: 30000,
      // ssl: ENV.POSTGRES_SSL ? { rejectUnauthorized: false } : false,
    });

    // Handle pool events
    this.pool.on('connect', (client) => {
      logger.debug('New PostgreSQL client connected');
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error:', err);
    });

    this.pool.on('remove', () => {
      logger.debug('PostgreSQL client removed from pool');
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Get a client from the pool
   */
  public async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      logger.error('Failed to get database client:', error);
      throw new Error('Database connection failed');
    }
  }

  /**
   * Execute a query
   */
  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executed', {
        duration: `${duration}ms`,
        rows: result.rowCount,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query failed', {
        duration: `${duration}ms`,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database connection health
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as status');
      return result.rows[0]?.status === 1;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get pool statistics
   */
  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Close all connections in the pool
   */
  public async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Error closing database pool:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const db = DatabaseConnection.getInstance();

// Export types for use in other modules
export type { PoolClient, QueryResult, QueryResultRow };
