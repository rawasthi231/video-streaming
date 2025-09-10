import { Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { CONSTANTS, ENV } from '../config/env.js';
import { UserService } from '../services/user-service.js';
import { AuthUtils, getClientIP } from '../utils/auth.js';
import {
  ApiResponse,
  RegisterRequest,
  LoginRequest,
  ChangePasswordRequest,
  registerSchema,
  loginSchema,
  changePasswordSchema,
} from '../types/index.js';

export class AuthController {
  // POST /auth/register
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() },
        } satisfies ApiResponse);
        return;
      }

      const data: RegisterRequest = parsed.data;

      // Check for duplicates
      const [emailExists, usernameExists] = await Promise.all([
        UserService.emailExists(data.email),
        UserService.usernameExists(data.username),
      ]);

      if (emailExists) {
        res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already in use' } });
        return;
      }
      if (usernameExists) {
        res.status(409).json({ success: false, error: { code: 'USERNAME_EXISTS', message: 'Username already in use' } });
        return;
      }

      // Create user
      const user = await UserService.createUser(data);

      // Create session and tokens
      const sessionId = AuthUtils.generateSessionId();
      const tokens = AuthUtils.generateTokens(user.id, sessionId);
      const sessionExpiresAt = AuthUtils.calculateSessionExpiry(false);

      const session = await UserService.createUserSession({
        userId: user.id,
        sessionId,
        refreshToken: tokens.refreshToken,
        userAgent: req.headers['user-agent'] || undefined,
        ipAddress: getClientIP(req),
        rememberMe: false,
        expiresAt: sessionExpiresAt,
      });

      // Store session in Redis
      await AuthUtils.createSession(session);

      // Set cookies
      res.cookie(CONSTANTS.COOKIES.ACCESS_TOKEN, tokens.accessToken, {
        httpOnly: ENV.COOKIE_HTTP_ONLY,
        secure: ENV.COOKIE_SECURE,
        sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        maxAge: tokens.expiresIn * 1000,
        domain: ENV.COOKIE_DOMAIN,
      });
      res.cookie(CONSTANTS.COOKIES.REFRESH_TOKEN, tokens.refreshToken, {
        httpOnly: ENV.COOKIE_HTTP_ONLY,
        secure: ENV.COOKIE_SECURE,
        sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        maxAge: tokens.refreshExpiresIn * 1000,
        domain: ENV.COOKIE_DOMAIN,
      });

      res.status(201).json({
        success: true,
        data: {
          user,
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            refreshExpiresIn: tokens.refreshExpiresIn,
          },
          session: { sessionId, expiresAt: sessionExpiresAt.toISOString() },
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Registration failed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } });
    }
  }

  // POST /auth/login
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() } });
        return;
      }
      const data: LoginRequest = parsed.data;

      // Find user
      const userEntity = await UserService.findByEmail(data.email);
      if (!userEntity) {
        res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
        return;
      }

      // Verify password
      const passwordValid = await AuthUtils.verifyPassword(data.password, userEntity.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
        return;
      }

      // Convert to safe user
      const user = await UserService.findById(userEntity.id);
      if (!user) {
        res.status(500).json({ success: false, error: { code: 'USER_FETCH_ERROR', message: 'Failed to retrieve user' } });
        return;
      }

      // Update last login
      await UserService.updateLastLogin(user.id);

      // Session handling
      const sessionId = AuthUtils.generateSessionId();
      const tokens = AuthUtils.generateTokens(user.id, sessionId);
      const sessionExpiresAt = AuthUtils.calculateSessionExpiry(Boolean(data.rememberMe));

      const session = await UserService.createUserSession({
        userId: user.id,
        sessionId,
        refreshToken: tokens.refreshToken,
        userAgent: req.headers['user-agent'] || undefined,
        ipAddress: getClientIP(req),
        rememberMe: Boolean(data.rememberMe),
        expiresAt: sessionExpiresAt,
      });

      await AuthUtils.createSession(session);

      // Set cookies
      res.cookie(CONSTANTS.COOKIES.ACCESS_TOKEN, tokens.accessToken, {
        httpOnly: ENV.COOKIE_HTTP_ONLY,
        secure: ENV.COOKIE_SECURE,
        sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        maxAge: tokens.expiresIn * 1000,
        domain: ENV.COOKIE_DOMAIN,
      });
      res.cookie(CONSTANTS.COOKIES.REFRESH_TOKEN, tokens.refreshToken, {
        httpOnly: ENV.COOKIE_HTTP_ONLY,
        secure: ENV.COOKIE_SECURE,
        sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        maxAge: tokens.refreshExpiresIn * 1000,
        domain: ENV.COOKIE_DOMAIN,
      });

      res.status(200).json({
        success: true,
        data: {
          user,
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            refreshExpiresIn: tokens.refreshExpiresIn,
          },
          session: { sessionId, expiresAt: sessionExpiresAt.toISOString() },
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Login failed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } });
    }
  }

  // POST /auth/logout
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = (req as any).sessionId || req.body.sessionId;
      if (sessionId) {
        await AuthUtils.deleteSession(sessionId);
        await UserService.deactivateSession(sessionId);
      }

      // Clear cookies
      res.clearCookie(CONSTANTS.COOKIES.ACCESS_TOKEN, { domain: ENV.COOKIE_DOMAIN });
      res.clearCookie(CONSTANTS.COOKIES.REFRESH_TOKEN, { domain: ENV.COOKIE_DOMAIN });

      res.status(200).json({ success: true, data: { loggedOut: true } } satisfies ApiResponse);
    } catch (error) {
      logger.error('Logout failed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Logout failed' } });
    }
  }

  // POST /auth/refresh
  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies?.[CONSTANTS.COOKIES.REFRESH_TOKEN] || req.body?.refreshToken;
      if (!refreshToken) {
        res.status(400).json({ success: false, error: { code: 'REFRESH_TOKEN_REQUIRED', message: 'Refresh token is required' } });
        return;
      }

      const decoded = AuthUtils.verifyToken(refreshToken, 'refresh');
      if (!decoded) {
        res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
        return;
      }

      const session = await AuthUtils.getSession(decoded.sessionId);
      if (!session) {
        res.status(401).json({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Session has expired' } });
        return;
      }

      const user = await UserService.findById(decoded.userId);
      if (!user) {
        res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
        return;
      }

      const tokens = AuthUtils.generateTokens(decoded.userId, decoded.sessionId);
      session.refreshToken = tokens.refreshToken;
      await AuthUtils.createSession(session);

      res.cookie(CONSTANTS.COOKIES.ACCESS_TOKEN, tokens.accessToken, {
        httpOnly: ENV.COOKIE_HTTP_ONLY,
        secure: ENV.COOKIE_SECURE,
        sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        maxAge: tokens.expiresIn * 1000,
        domain: ENV.COOKIE_DOMAIN,
      });
      res.cookie(CONSTANTS.COOKIES.REFRESH_TOKEN, tokens.refreshToken, {
        httpOnly: ENV.COOKIE_HTTP_ONLY,
        secure: ENV.COOKIE_SECURE,
        sameSite: ENV.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none',
        maxAge: tokens.refreshExpiresIn * 1000,
        domain: ENV.COOKIE_DOMAIN,
      });

      res.status(200).json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn } } satisfies ApiResponse);
    } catch (error) {
      logger.error('Token refresh failed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Token refresh failed' } });
    }
  }

  // GET /auth/profile
  static async profile(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
        return;
      }
      res.status(200).json({ success: true, data: { user } } satisfies ApiResponse);
    } catch (error) {
      logger.error('Profile fetch failed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Profile fetch failed' } });
    }
  }

  // POST /auth/change-password
  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
        return;
      }

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() } });
        return;
      }
      const { currentPassword, newPassword } = parsed.data as ChangePasswordRequest;

      const success = await UserService.changePassword(user.id, currentPassword, newPassword);
      if (!success) {
        res.status(400).json({ success: false, error: { code: 'CHANGE_PASSWORD_FAILED', message: 'Could not change password' } });
        return;
      }

      res.status(200).json({ success: true, data: { changed: true } } satisfies ApiResponse);
    } catch (error) {
      logger.error('Change password failed:', error);
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Change password failed' } });
    }
  }
}

