import { Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { UserService } from '../services/user-service.js';
import {
  ApiResponse,
  UpdateProfileRequest,
  updateProfileSchema,
} from '../types/index.js';

export class UserController {
  // GET /users/:userId
  static async getUserProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = (req as any).user;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_USER_ID', message: 'User ID is required' },
        } satisfies ApiResponse);
        return;
      }

      // Users can only access their own profile for now (could be extended for public profiles)
      if (!currentUser || currentUser.id !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        } satisfies ApiResponse);
        return;
      }

      const user = await UserService.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { user },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get user profile' },
      } satisfies ApiResponse);
    }
  }

  // PUT /users/:userId
  static async updateUserProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = (req as any).user;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_USER_ID', message: 'User ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!currentUser || currentUser.id !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        } satisfies ApiResponse);
        return;
      }

      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() },
        } satisfies ApiResponse);
        return;
      }

      const data = parsed.data as UpdateProfileRequest;

      const updatedUser = await UserService.updateProfile(userId, data);
      if (!updatedUser) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { user: updatedUser },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update user profile' },
      } satisfies ApiResponse);
    }
  }

  // DELETE /users/:userId
  static async deactivateUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = (req as any).user;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_USER_ID', message: 'User ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!currentUser || currentUser.id !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        } satisfies ApiResponse);
        return;
      }

      const success = await UserService.deactivateUser(userId);
      if (!success) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse);
        return;
      }

      // Deactivate all user sessions
      await UserService.deactivateAllUserSessions(userId);

      res.status(200).json({
        success: true,
        data: { deactivated: true },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to deactivate user:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate user' },
      } satisfies ApiResponse);
    }
  }

  // GET /users/:userId/sessions
  static async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUser = (req as any).user;

      if (!currentUser || currentUser.id !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        } satisfies ApiResponse);
        return;
      }

      // This would require a new method in UserService to get all active sessions
      // For now, return basic session info
      res.status(200).json({
        success: true,
        data: { 
          message: 'Session management not yet implemented',
          currentSessionId: (req as any).sessionId || null
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get user sessions:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get user sessions' },
      } satisfies ApiResponse);
    }
  }

  // POST /users/:userId/sessions/:sessionId/revoke
  static async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const { userId, sessionId } = req.params;
      const currentUser = (req as any).user;

      if (!userId || !sessionId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PARAMETERS', message: 'User ID and Session ID are required' },
        } satisfies ApiResponse);
        return;
      }

      if (!currentUser || currentUser.id !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        } satisfies ApiResponse);
        return;
      }

      // Deactivate the specific session
      await UserService.deactivateSession(sessionId);

      res.status(200).json({
        success: true,
        data: { revoked: true },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to revoke session:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke session' },
      } satisfies ApiResponse);
    }
  }

  // GET /users/me (convenience endpoint for current user)
  static async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = (req as any).user;

      if (!currentUser) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { user: currentUser },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get current user:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get current user' },
      } satisfies ApiResponse);
    }
  }
}
