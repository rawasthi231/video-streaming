import { Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { ChannelService } from '../services/channel-service.js';
import {
  ApiResponse,
  CreateChannelRequest,
  UpdateChannelRequest,
  SubscriptionRequest,
  createChannelSchema,
  updateChannelSchema,
  subscriptionSchema,
} from '../types/index.js';

export class ChannelController {
  // POST /channels
  static async createChannel(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      const parsed = createChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() },
        } satisfies ApiResponse);
        return;
      }

      const data: CreateChannelRequest = parsed.data;

      // Check if handle already exists
      const handleExists = await ChannelService.handleExists(data.handle);
      if (handleExists) {
        res.status(409).json({
          success: false,
          error: { code: 'HANDLE_EXISTS', message: 'Channel handle already exists' },
        } satisfies ApiResponse);
        return;
      }

      const channel = await ChannelService.createChannel(user.id, data);

      res.status(201).json({
        success: true,
        data: { channel },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to create channel:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create channel' },
      } satisfies ApiResponse);
    }
  }

  // GET /channels/:channelId
  static async getChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      const channel = await ChannelService.findById(channelId);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { channel },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get channel:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel' },
      } satisfies ApiResponse);
    }
  }

  // GET /channels/@:handle
  static async getChannelByHandle(req: Request, res: Response): Promise<void> {
    try {
      const { handle } = req.params;

      if (!handle) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_HANDLE', message: 'Handle is required' },
        } satisfies ApiResponse);
        return;
      }

      const channel = await ChannelService.findByHandle(handle);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { channel },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get channel by handle:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel' },
      } satisfies ApiResponse);
    }
  }

  // GET /channels/user/:userId
  static async getUserChannels(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const user = (req as any).user;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_USER_ID', message: 'User ID is required' },
        } satisfies ApiResponse);
        return;
      }

      // Users can only see their own channels, unless we implement public channels later
      if (user?.id !== userId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' },
        } satisfies ApiResponse);
        return;
      }

      const channels = await ChannelService.findByUserId(userId);

      res.status(200).json({
        success: true,
        data: { channels },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get user channels:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get channels' },
      } satisfies ApiResponse);
    }
  }

  // PUT /channels/:channelId
  static async updateChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const user = (req as any).user;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      const parsed = updateChannelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() },
        } satisfies ApiResponse);
        return;
      }

      const data: UpdateChannelRequest = parsed.data;

      const channel = await ChannelService.updateChannel(channelId, user.id, data);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found or access denied' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { channel },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to update channel:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update channel' },
      } satisfies ApiResponse);
    }
  }

  // DELETE /channels/:channelId
  static async deleteChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const user = (req as any).user;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      const success = await ChannelService.deleteChannel(channelId, user.id);
      if (!success) {
        res.status(404).json({
          success: false,
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found or access denied' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { deleted: true },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to delete channel:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete channel' },
      } satisfies ApiResponse);
    }
  }

  // GET /channels/:channelId/stats
  static async getChannelStats(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      const stats = await ChannelService.getChannelStats(channelId);
      if (!stats) {
        res.status(404).json({
          success: false,
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { stats },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get channel stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get channel stats' },
      } satisfies ApiResponse);
    }
  }

  // GET /channels/search?q=query&limit=20&offset=0
  static async searchChannels(req: Request, res: Response): Promise<void> {
    try {
      const { q: query, limit = '20', offset = '0' } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_QUERY', message: 'Search query is required' },
        } satisfies ApiResponse);
        return;
      }

      const limitNum = parseInt(limit as string, 10);
      const offsetNum = parseInt(offset as string, 10);

      if (isNaN(limitNum) || isNaN(offsetNum) || limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PARAMETERS', message: 'Invalid limit or offset parameters' },
        } satisfies ApiResponse);
        return;
      }

      const channels = await ChannelService.searchChannels(query, limitNum, offsetNum);

      res.status(200).json({
        success: true,
        data: {
          channels,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            total: channels.length, // This would need a count query in production
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to search channels:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to search channels' },
      } satisfies ApiResponse);
    }
  }

  // POST /channels/:channelId/subscribe
  static async subscribeToChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const user = (req as any).user;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      // Check if channel exists
      const channel = await ChannelService.findById(channelId);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel not found' },
        } satisfies ApiResponse);
        return;
      }

      // Users cannot subscribe to their own channel
      if (channel.userId === user.id) {
        res.status(400).json({
          success: false,
          error: { code: 'SELF_SUBSCRIBE', message: 'Cannot subscribe to your own channel' },
        } satisfies ApiResponse);
        return;
      }

      const { notificationsEnabled = true } = req.body;

      const subscription = await ChannelService.subscribe(user.id, channelId, notificationsEnabled);

      res.status(200).json({
        success: true,
        data: { subscription },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to subscribe to channel:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to subscribe to channel' },
      } satisfies ApiResponse);
    }
  }

  // DELETE /channels/:channelId/subscribe
  static async unsubscribeFromChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const user = (req as any).user;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      const success = await ChannelService.unsubscribe(user.id, channelId);

      res.status(200).json({
        success: true,
        data: { unsubscribed: success },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to unsubscribe from channel:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to unsubscribe from channel' },
      } satisfies ApiResponse);
    }
  }

  // GET /channels/:channelId/subscription
  static async getSubscriptionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const user = (req as any).user;

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CHANNEL_ID', message: 'Channel ID is required' },
        } satisfies ApiResponse);
        return;
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      const subscription = await ChannelService.findSubscription(user.id, channelId);

      res.status(200).json({
        success: true,
        data: {
          subscribed: subscription ? subscription.isActive : false,
          subscription: subscription || null,
        },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get subscription status:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get subscription status' },
      } satisfies ApiResponse);
    }
  }

  // GET /subscriptions
  static async getUserSubscriptions(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse);
        return;
      }

      const subscriptions = await ChannelService.getUserSubscriptions(user.id);

      res.status(200).json({
        success: true,
        data: { subscriptions },
      } satisfies ApiResponse);
    } catch (error) {
      logger.error('Failed to get user subscriptions:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get subscriptions' },
      } satisfies ApiResponse);
    }
  }
}
