import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../config/logger.js';
import {
  Channel,
  ChannelEntity,
  Subscription,
  SubscriptionWithChannel,
  CreateChannelRequest,
  UpdateChannelRequest,
  ChannelStats,
} from '../types/index.js';

/**
 * Channel service for database operations
 */
export class ChannelService {
  /**
   * Create a new channel
   */
  static async createChannel(userId: string, channelData: CreateChannelRequest): Promise<Channel> {
    try {
      const channelId = uuidv4();
      
      const query = `
        INSERT INTO channels (
          id, user_id, handle, name, description, 
          subscriber_count, video_count, total_views,
          is_verified, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 0, 0, 0, false, true, NOW(), NOW())
        RETURNING id, user_id, handle, name, description, avatar_url, banner_url,
                 subscriber_count, video_count, total_views, is_verified, 
                 is_active, created_at, updated_at
      `;
      
      const values = [
        channelId,
        userId,
        channelData.handle.toLowerCase(),
        channelData.name,
        channelData.description || null,
      ];
      
      const result = await db.query<ChannelEntity>(query, values);
      const channelEntity = result.rows[0];
      
      if (!channelEntity) {
        throw new Error('Failed to create channel');
      }
      
      logger.info('Channel created successfully:', {
        channelId: channelEntity.id,
        userId: channelEntity.userId,
        handle: channelEntity.handle,
      });
      
      return this.entityToChannel(channelEntity);
    } catch (error) {
      logger.error('Failed to create channel:', error);
      throw error;
    }
  }

  /**
   * Find channel by ID
   */
  static async findById(channelId: string): Promise<Channel | null> {
    try {
      const query = `
        SELECT id, user_id, handle, name, description, avatar_url, banner_url,
               subscriber_count, video_count, total_views, is_verified, 
               is_active, created_at, updated_at
        FROM channels 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await db.query<ChannelEntity>(query, [channelId]);
      const channelEntity = result.rows[0];
      
      if (!channelEntity) {
        return null;
      }
      
      return this.entityToChannel(channelEntity);
    } catch (error) {
      logger.error('Failed to find channel by ID:', error);
      throw error;
    }
  }

  /**
   * Find channel by handle
   */
  static async findByHandle(handle: string): Promise<Channel | null> {
    try {
      const query = `
        SELECT id, user_id, handle, name, description, avatar_url, banner_url,
               subscriber_count, video_count, total_views, is_verified, 
               is_active, created_at, updated_at
        FROM channels 
        WHERE handle = $1 AND is_active = true
      `;
      
      const result = await db.query<ChannelEntity>(query, [handle.toLowerCase()]);
      const channelEntity = result.rows[0];
      
      if (!channelEntity) {
        return null;
      }
      
      return this.entityToChannel(channelEntity);
    } catch (error) {
      logger.error('Failed to find channel by handle:', error);
      throw error;
    }
  }

  /**
   * Find channels by user ID
   */
  static async findByUserId(userId: string): Promise<Channel[]> {
    try {
      const query = `
        SELECT id, user_id, handle, name, description, avatar_url, banner_url,
               subscriber_count, video_count, total_views, is_verified, 
               is_active, created_at, updated_at
        FROM channels 
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `;
      
      const result = await db.query<ChannelEntity>(query, [userId]);
      
      return result.rows.map(entity => this.entityToChannel(entity));
    } catch (error) {
      logger.error('Failed to find channels by user ID:', error);
      throw error;
    }
  }

  /**
   * Update channel
   */
  static async updateChannel(
    channelId: string,
    userId: string,
    updateData: UpdateChannelRequest
  ): Promise<Channel | null> {
    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic update query
      if (updateData.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateData.name);
      }
      
      if (updateData.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updateData.description);
      }
      
      if (updateData.avatarUrl !== undefined) {
        updateFields.push(`avatar_url = $${paramIndex++}`);
        values.push(updateData.avatarUrl);
      }
      
      if (updateData.bannerUrl !== undefined) {
        updateFields.push(`banner_url = $${paramIndex++}`);
        values.push(updateData.bannerUrl);
      }

      if (updateFields.length === 0) {
        return await this.findById(channelId);
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(channelId, userId);

      const query = `
        UPDATE channels 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} AND is_active = true
        RETURNING id, user_id, handle, name, description, avatar_url, banner_url,
                 subscriber_count, video_count, total_views, is_verified, 
                 is_active, created_at, updated_at
      `;
      
      const result = await db.query<ChannelEntity>(query, values);
      const channelEntity = result.rows[0];
      
      if (!channelEntity) {
        return null;
      }
      
      logger.info('Channel updated:', {
        channelId,
        userId,
        updatedFields: Object.keys(updateData),
      });
      
      return this.entityToChannel(channelEntity);
    } catch (error) {
      logger.error('Failed to update channel:', error);
      throw error;
    }
  }

  /**
   * Delete channel (soft delete)
   */
  static async deleteChannel(channelId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE channels 
        SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND is_active = true
      `;
      
      const result = await db.query(query, [channelId, userId]);
      
      const success = (result.rowCount ?? 0) > 0;
      if (success) {
        logger.info('Channel deleted:', { channelId, userId });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to delete channel:', error);
      throw error;
    }
  }

  /**
   * Check if handle exists
   */
  static async handleExists(handle: string): Promise<boolean> {
    try {
      const query = `
        SELECT 1 FROM channels WHERE handle = $1 LIMIT 1
      `;
      
      const result = await db.query(query, [handle.toLowerCase()]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Failed to check if handle exists:', error);
      throw error;
    }
  }

  /**
   * Get channel statistics
   */
  static async getChannelStats(channelId: string): Promise<ChannelStats | null> {
    try {
      // This would need to be implemented with proper video analytics
      // For now, return basic stats from channels table
      const query = `
        SELECT subscriber_count, video_count, total_views,
               0 as total_watch_time, 0 as average_view_duration
        FROM channels 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await db.query(query, [channelId]);
      const stats = result.rows[0];
      
      if (!stats) {
        return null;
      }
      
      return {
        subscriberCount: stats.subscriber_count,
        videoCount: stats.video_count,
        totalViews: stats.total_views,
        totalWatchTime: stats.total_watch_time,
        averageViewDuration: stats.average_view_duration,
      };
    } catch (error) {
      logger.error('Failed to get channel stats:', error);
      throw error;
    }
  }

  /**
   * Search channels
   */
  static async searchChannels(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Channel[]> {
    try {
      const searchQuery = `
        SELECT id, user_id, handle, name, description, avatar_url, banner_url,
               subscriber_count, video_count, total_views, is_verified, 
               is_active, created_at, updated_at
        FROM channels 
        WHERE is_active = true 
          AND (
            name ILIKE $1 
            OR handle ILIKE $1 
            OR description ILIKE $1
          )
        ORDER BY subscriber_count DESC, name ASC
        LIMIT $2 OFFSET $3
      `;
      
      const searchTerm = `%${query}%`;
      const result = await db.query<ChannelEntity>(searchQuery, [searchTerm, limit, offset]);
      
      return result.rows.map(entity => this.entityToChannel(entity));
    } catch (error) {
      logger.error('Failed to search channels:', error);
      throw error;
    }
  }

  /**
   * Subscribe to channel
   */
  static async subscribe(subscriberId: string, channelId: string, notificationsEnabled: boolean = true): Promise<Subscription> {
    try {
      const subscriptionId = uuidv4();
      
      await db.transaction(async (client) => {
        // Insert subscription
        const insertQuery = `
          INSERT INTO subscriptions (
            id, subscriber_id, channel_id, is_active, notifications_enabled, 
            created_at, updated_at
          ) VALUES ($1, $2, $3, true, $4, NOW(), NOW())
          ON CONFLICT (subscriber_id, channel_id) 
          DO UPDATE SET 
            is_active = true,
            notifications_enabled = $4,
            updated_at = NOW()
        `;
        
        await client.query(insertQuery, [subscriptionId, subscriberId, channelId, notificationsEnabled]);
        
        // Update channel subscriber count
        const updateCountQuery = `
          UPDATE channels 
          SET subscriber_count = (
            SELECT COUNT(*) FROM subscriptions 
            WHERE channel_id = $1 AND is_active = true
          ), updated_at = NOW()
          WHERE id = $1
        `;
        
        await client.query(updateCountQuery, [channelId]);
      });
      
      const subscription = await this.findSubscription(subscriberId, channelId);
      if (!subscription) {
        throw new Error('Failed to create subscription');
      }
      
      logger.info('User subscribed to channel:', {
        subscriberId,
        channelId,
        notificationsEnabled,
      });
      
      return subscription;
    } catch (error) {
      logger.error('Failed to subscribe to channel:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from channel
   */
  static async unsubscribe(subscriberId: string, channelId: string): Promise<boolean> {
    try {
      await db.transaction(async (client) => {
        // Deactivate subscription
        const updateQuery = `
          UPDATE subscriptions 
          SET is_active = false, updated_at = NOW()
          WHERE subscriber_id = $1 AND channel_id = $2
        `;
        
        await client.query(updateQuery, [subscriberId, channelId]);
        
        // Update channel subscriber count
        const updateCountQuery = `
          UPDATE channels 
          SET subscriber_count = (
            SELECT COUNT(*) FROM subscriptions 
            WHERE channel_id = $1 AND is_active = true
          ), updated_at = NOW()
          WHERE id = $1
        `;
        
        await client.query(updateCountQuery, [channelId]);
      });
      
      logger.info('User unsubscribed from channel:', {
        subscriberId,
        channelId,
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to unsubscribe from channel:', error);
      throw error;
    }
  }

  /**
   * Find subscription
   */
  static async findSubscription(subscriberId: string, channelId: string): Promise<Subscription | null> {
    try {
      const query = `
        SELECT id, subscriber_id, channel_id, is_active, notifications_enabled,
               created_at, updated_at
        FROM subscriptions 
        WHERE subscriber_id = $1 AND channel_id = $2
      `;
      
      const result = await db.query<Subscription>(query, [subscriberId, channelId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find subscription:', error);
      throw error;
    }
  }

  /**
   * Get user subscriptions
   */
  static async getUserSubscriptions(userId: string): Promise<SubscriptionWithChannel[]> {
    try {
      const query = `
        SELECT 
          s.id, s.subscriber_id, s.channel_id, s.is_active, s.notifications_enabled,
          s.created_at, s.updated_at,
          c.id as channel_id, c.user_id as channel_user_id, c.handle, c.name, 
          c.description, c.avatar_url, c.banner_url, c.subscriber_count, 
          c.video_count, c.total_views, c.is_verified, c.is_active as channel_is_active,
          c.created_at as channel_created_at, c.updated_at as channel_updated_at
        FROM subscriptions s
        JOIN channels c ON s.channel_id = c.id
        WHERE s.subscriber_id = $1 AND s.is_active = true AND c.is_active = true
        ORDER BY s.created_at DESC
      `;
      
      const result = await db.query(query, [userId]);
      
      return result.rows.map(row => ({
        id: row.id,
        subscriberId: row.subscriber_id,
        channelId: row.channel_id,
        isActive: row.is_active,
        notificationsEnabled: row.notifications_enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        channel: {
          id: row.channel_id,
          userId: row.channel_user_id,
          handle: row.handle,
          name: row.name,
          description: row.description || undefined,
          avatarUrl: row.avatar_url || undefined,
          bannerUrl: row.banner_url || undefined,
          subscriberCount: row.subscriber_count,
          videoCount: row.video_count,
          totalViews: row.total_views,
          isVerified: row.is_verified,
          isActive: row.channel_is_active,
          createdAt: row.channel_created_at,
          updatedAt: row.channel_updated_at,
        },
      }));
    } catch (error) {
      logger.error('Failed to get user subscriptions:', error);
      throw error;
    }
  }

  /**
   * Get channel subscribers count
   */
  static async getSubscriberCount(channelId: string): Promise<number> {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM subscriptions 
        WHERE channel_id = $1 AND is_active = true
      `;
      
      const result = await db.query(query, [channelId]);
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      logger.error('Failed to get subscriber count:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  /**
   * Convert ChannelEntity to Channel (clean interface)
   */
  private static entityToChannel(entity: ChannelEntity): Channel {
    return {
      id: entity.id,
      userId: entity.userId,
      handle: entity.handle,
      name: entity.name,
      description: entity.description || undefined,
      avatarUrl: entity.avatarUrl || undefined,
      bannerUrl: entity.bannerUrl || undefined,
      subscriberCount: entity.subscriberCount,
      videoCount: entity.videoCount,
      totalViews: entity.totalViews,
      isVerified: entity.isVerified,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
