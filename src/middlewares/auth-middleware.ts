import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';
import { AuthUtils, getClientIP } from '../utils/auth.js';
import { UserService } from '../services/user-service.js';
import { CONSTANTS, ENV } from '../config/env.js';
import { JWTPayload, User } from '../types/index.js';

// Extend Express Request interface to include user information
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
      clientIP?: string;
    }
  }
}

/**
 * Authentication middleware to verify JWT tokens and populate user information
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from various sources
    let token: string | undefined;
    
    // 1. Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // 2. Check cookies
    if (!token && req.cookies) {
      token = req.cookies[CONSTANTS.COOKIES.ACCESS_TOKEN];
    }
    
    // 3. Check query parameter (for special cases like WebSocket upgrades)
    if (!token && req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token is required',
        },
      });
      return;
    }

    // Verify the access token
    const decoded = AuthUtils.verifyToken(token, 'access');
    if (!decoded) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired access token',
        },
      });
      return;
    }

    // Verify session exists and is active
    const session = await AuthUtils.getSession(decoded.sessionId);
    if (!session) {
      res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
        },
      });
      return;
    }

    // Get user information
    const user = await UserService.findById(decoded.userId);
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or inactive',
        },
      });
      return;
    }

    // Update session last accessed time
    await AuthUtils.updateSessionAccess(decoded.sessionId);

    // Attach user and session information to request
    req.user = user;
    req.sessionId = decoded.sessionId;
    req.clientIP = getClientIP(req);

    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication processing failed',
      },
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if token is missing
 */
export const authenticateOptional = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from various sources
    let token: string | undefined;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token && req.cookies) {
      token = req.cookies[CONSTANTS.COOKIES.ACCESS_TOKEN];
    }
    
    if (!token && req.query.token) {
      token = req.query.token as string;
    }

    // If no token, continue without authentication
    if (!token) {
      req.clientIP = getClientIP(req);
      next();
      return;
    }

    // Try to verify token, but don't fail if invalid
    const decoded = AuthUtils.verifyToken(token, 'access');
    if (decoded) {
      const session = await AuthUtils.getSession(decoded.sessionId);
      if (session) {
        const user = await UserService.findById(decoded.userId);
        if (user && user.isActive) {
          req.user = user;
          req.sessionId = decoded.sessionId;
          await AuthUtils.updateSessionAccess(decoded.sessionId);
        }
      }
    }

    req.clientIP = getClientIP(req);
    next();
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    req.clientIP = getClientIP(req);
    next(); // Continue even if authentication fails
  }
};

/**
 * Middleware to refresh access token using refresh token
 */
export const refreshTokenMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract refresh token from cookie or body
    let refreshToken: string | undefined;
    
    if (req.cookies && req.cookies[CONSTANTS.COOKIES.REFRESH_TOKEN]) {
      refreshToken = req.cookies[CONSTANTS.COOKIES.REFRESH_TOKEN];
    } else if (req.body && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REQUIRED',
          message: 'Refresh token is required',
        },
      });
      return;
    }

    // Verify refresh token
    const decoded = AuthUtils.verifyToken(refreshToken, 'refresh');
    if (!decoded) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
      return;
    }

    // Verify session exists and is active
    const session = await AuthUtils.getSession(decoded.sessionId);
    if (!session) {
      res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
        },
      });
      return;
    }

    // Get user information
    const user = await UserService.findById(decoded.userId);
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or inactive',
        },
      });
      return;
    }

    // Generate new token pair
    const newTokens = AuthUtils.generateTokens(decoded.userId, decoded.sessionId);

    // Update session with new refresh token
    session.refreshToken = newTokens.refreshToken;
    await AuthUtils.createSession(session);

    // Set new tokens in cookies
    res.cookie(CONSTANTS.COOKIES.ACCESS_TOKEN, newTokens.accessToken, {
      httpOnly: ENV.COOKIE_HTTP_ONLY,
      secure: ENV.COOKIE_SECURE,
      sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
      maxAge: newTokens.expiresIn * 1000,
      domain: ENV.COOKIE_DOMAIN,
    });

    res.cookie(CONSTANTS.COOKIES.REFRESH_TOKEN, newTokens.refreshToken, {
      httpOnly: ENV.COOKIE_HTTP_ONLY,
      secure: ENV.COOKIE_SECURE,
      sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
      maxAge: newTokens.refreshExpiresIn * 1000,
      domain: ENV.COOKIE_DOMAIN,
    });

    // Attach user information to request
    req.user = user;
    req.sessionId = decoded.sessionId;
    req.clientIP = getClientIP(req);

    next();
  } catch (error) {
    logger.error('Refresh token middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token refresh processing failed',
      },
    });
  }
};

/**
 * Middleware to check if user has specific permissions (placeholder for future role-based access)
 */
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      // For now, all authenticated users have all permissions
      // This can be extended later with role-based access control
      logger.debug('Permission check passed:', {
        userId: req.user.id,
        permission,
      });

      next();
    } catch (error) {
      logger.error('Permission middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Permission check failed',
        },
      });
    }
  };
};

/**
 * Middleware to ensure user can only access their own resources
 */
export const requireSelfOrAdmin = (userIdParam: string = 'userId') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const targetUserId = req.params[userIdParam];
      if (!targetUserId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: `Parameter '${userIdParam}' is required`,
          },
        });
        return;
      }

      // Allow access if user is accessing their own resources
      if (req.user.id === targetUserId) {
        next();
        return;
      }

      // For now, only allow self access
      // This can be extended later with admin roles
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You can only access your own resources',
        },
      });
    } catch (error) {
      logger.error('Self access middleware error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Access control check failed',
        },
      });
    }
  };
};

/**
 * Middleware to rate limit authentication attempts
 */
export const authRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clientIP = getClientIP(req);
    const key = `auth_rate_limit:${clientIP}`;
    
    // This is a basic implementation - can be enhanced with Redis rate limiting
    // For now, we'll just log and continue
    logger.debug('Auth rate limit check:', { clientIP, key });
    
    next();
  } catch (error) {
    logger.error('Auth rate limit middleware error:', error);
    next(); // Continue even if rate limiting fails
  }
};
