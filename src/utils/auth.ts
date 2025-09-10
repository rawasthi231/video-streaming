import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis } from '../config/redis.js';
import {
  JWTPayload,
  AuthTokens,
  UserSession,
  UserSessionEntity,
} from '../types/index.js';

/**
 * Authentication utility class
 */
export class AuthUtils {
  /**
   * Hash password with bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, ENV.BCRYPT_SALT_ROUNDS);
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Password processing failed');
    }
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      logger.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Generate JWT token pair (access and refresh)
   */
  static generateTokens(
    userId: string,
    sessionId: string
  ): AuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenExpiry = this.parseTokenExpiry(ENV.JWT_ACCESS_EXPIRES_IN);
    const refreshTokenExpiry = this.parseTokenExpiry(ENV.JWT_REFRESH_EXPIRES_IN);

    const commonPayload = {
      userId,
      sessionId,
      iss: 'video-streaming-app',
      aud: 'video-streaming-users',
    };

    // Generate access token
    const accessPayload: JWTPayload = {
      ...commonPayload,
      type: 'access',
      iat: now,
      exp: now + accessTokenExpiry,
    };

    const accessToken = jwt.sign(accessPayload, ENV.JWT_ACCESS_SECRET);

    // Generate refresh token
    const refreshPayload: JWTPayload = {
      ...commonPayload,
      type: 'refresh',
      iat: now,
      exp: now + refreshTokenExpiry,
    };

    const refreshToken = jwt.sign(refreshPayload, ENV.JWT_REFRESH_SECRET);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTokenExpiry,
      refreshExpiresIn: refreshTokenExpiry,
    };
  }

  /**
   * Verify and decode JWT token
   */
  static verifyToken(
    token: string,
    type: 'access' | 'refresh'
  ): JWTPayload | null {
    try {
      const secret = type === 'access' 
        ? ENV.JWT_ACCESS_SECRET 
        : ENV.JWT_REFRESH_SECRET;
      
      const decoded = jwt.verify(token, secret) as JWTPayload;
      
      // Verify token type matches expected type
      if (decoded.type !== type) {
        logger.warn('Token type mismatch:', { expected: type, actual: decoded.type });
        return null;
      }
      
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Token expired:', { type, error: error.message });
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid token:', { type, error: error.message });
      } else {
        logger.error('Token verification failed:', { type, error });
      }
      return null;
    }
  }

  /**
   * Generate a new session ID
   */
  static generateSessionId(): string {
    return uuidv4();
  }

  /**
   * Create user session in Redis
   */
  static async createSession(
    sessionData: UserSessionEntity
  ): Promise<void> {
    try {
      const sessionKey = `${ENV.REDIS_SESSION_PREFIX}${sessionData.sessionId}`;
      const ttlSeconds = Math.floor(
        (sessionData.expiresAt.getTime() - Date.now()) / 1000
      );

      await redis.set(sessionKey, sessionData, ttlSeconds);
      
      logger.debug('Session created:', {
        sessionId: sessionData.sessionId,
        userId: sessionData.userId,
        expiresAt: sessionData.expiresAt,
      });
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw new Error('Session creation failed');
    }
  }

  /**
   * Get user session from Redis
   */
  static async getSession(
    sessionId: string
  ): Promise<UserSessionEntity | null> {
    try {
      const sessionKey = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      const sessionData = await redis.get<UserSessionEntity>(sessionKey);
      
      if (!sessionData) {
        return null;
      }

      // Check if session is still active
      if (!sessionData.isActive || new Date() > new Date(sessionData.expiresAt)) {
        await this.deleteSession(sessionId);
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session:', { sessionId, error });
      return null;
    }
  }

  /**
   * Update session last accessed time
   */
  static async updateSessionAccess(
    sessionId: string
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return;
      }

      session.lastAccessedAt = new Date();
      const sessionKey = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      const ttlSeconds = Math.floor(
        (session.expiresAt.getTime() - Date.now()) / 1000
      );

      await redis.set(sessionKey, session, ttlSeconds);
    } catch (error) {
      logger.error('Failed to update session access:', { sessionId, error });
    }
  }

  /**
   * Delete user session
   */
  static async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = `${ENV.REDIS_SESSION_PREFIX}${sessionId}`;
      const deleted = await redis.delete(sessionKey);
      
      if (deleted) {
        logger.debug('Session deleted:', { sessionId });
      }
      
      return deleted;
    } catch (error) {
      logger.error('Failed to delete session:', { sessionId, error });
      return false;
    }
  }

  /**
   * Delete all sessions for a user
   */
  static async deleteAllUserSessions(userId: string): Promise<void> {
    try {
      const pattern = `${ENV.REDIS_SESSION_PREFIX}*`;
      const client = redis.getClient();
      const keys = await client.keys(pattern);
      
      for (const key of keys) {
        const sessionData = await redis.get<UserSessionEntity>(key.replace(ENV.REDIS_KEY_PREFIX, ''));
        if (sessionData && sessionData.userId === userId) {
          await redis.delete(key.replace(ENV.REDIS_KEY_PREFIX, ''));
        }
      }
      
      logger.debug('All user sessions deleted:', { userId });
    } catch (error) {
      logger.error('Failed to delete all user sessions:', { userId, error });
    }
  }

  /**
   * Parse token expiry string to seconds
   */
  private static parseTokenExpiry(expiry: string): number {
    const regex = /^(\d+)([smhd])$/;
    const match = expiry.match(regex);
    
    if (!match) {
      throw new Error(`Invalid token expiry format: ${expiry}`);
    }
    
    const value = match[1] ? parseInt(match[1]) : 0;
    const unit = match[2];
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  /**
   * Extract user agent information
   */
  static parseUserAgent(userAgent?: string): {
    browser?: string;
    os?: string;
    device?: string;
  } {
    if (!userAgent) {
      return {};
    }

    // Simple user agent parsing (could be enhanced with a proper library)
    const info: { browser?: string; os?: string; device?: string } = {};

    // Browser detection
    if (userAgent.includes('Chrome')) {
      info.browser = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      info.browser = 'Firefox';
    } else if (userAgent.includes('Safari')) {
      info.browser = 'Safari';
    } else if (userAgent.includes('Edge')) {
      info.browser = 'Edge';
    }

    // OS detection
    if (userAgent.includes('Windows')) {
      info.os = 'Windows';
    } else if (userAgent.includes('Mac')) {
      info.os = 'macOS';
    } else if (userAgent.includes('Linux')) {
      info.os = 'Linux';
    } else if (userAgent.includes('Android')) {
      info.os = 'Android';
    } else if (userAgent.includes('iOS')) {
      info.os = 'iOS';
    }

    // Device detection
    if (userAgent.includes('Mobile')) {
      info.device = 'Mobile';
    } else if (userAgent.includes('Tablet')) {
      info.device = 'Tablet';
    } else {
      info.device = 'Desktop';
    }

    return info;
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(): string {
    return uuidv4().replace(/-/g, '');
  }

  /**
   * Calculate session expiry date
   */
  static calculateSessionExpiry(rememberMe: boolean = false): Date {
    const now = new Date();
    if (rememberMe) {
      // 30 days for "remember me"
      return new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    } else {
      // 7 days for regular session
      return new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
    }
  }
}

// Helper function to get client IP
export function getClientIP(req: any): string {
  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}
