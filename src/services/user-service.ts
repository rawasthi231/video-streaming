import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AuthUtils } from '../utils/auth.js';
import {
  User,
  UserEntity,
  UserSessionEntity,
  RegisterRequest,
  UpdateProfileRequest,
} from '../types/index.js';

/**
 * User service for database operations
 */
export class UserService {
  /**
   * Create a new user
   */
  static async createUser(userData: RegisterRequest): Promise<User> {
    try {
      const userId = uuidv4();
      const hashedPassword = await AuthUtils.hashPassword(userData.password);
      
      const query = `
        INSERT INTO users (
          id, username, email, password_hash, display_name, 
          is_email_verified, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, username, email, display_name, profile_picture,
                 is_email_verified, is_active, last_login_at, created_at, updated_at
      `;
      
      const values = [
        userId,
        userData.username.toLowerCase(),
        userData.email.toLowerCase(),
        hashedPassword,
        userData.displayName || userData.username,
        false, // email not verified by default
        true,  // active by default
      ];
      
      const result = await db.query<UserEntity>(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to create user');
      }
      
      const userEntity = result.rows[0];
      if (!userEntity) {
        throw new Error('Failed to create user - no data returned');
      }
      
      logger.info('User created successfully:', {
        userId: userEntity.id,
        username: userEntity.username,
        email: userEntity.email,
      });
      
      return this.entityToUser(userEntity);
    } catch (error) {
      logger.error('Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<UserEntity | null> {
    try {
      const query = `
        SELECT * FROM users 
        WHERE email = $1 AND is_active = true
      `;
      
      const result = await db.query<UserEntity>(query, [email.toLowerCase()]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by username
   */
  static async findByUsername(username: string): Promise<UserEntity | null> {
    try {
      const query = `
        SELECT * FROM users 
        WHERE username = $1 AND is_active = true
      `;
      
      const result = await db.query<UserEntity>(query, [username.toLowerCase()]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user by username:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  static async findById(userId: string): Promise<User | null> {
    try {
      const query = `
        SELECT id, username, email, display_name, profile_picture,
               bio, website, location, birth_date, is_email_verified,
               is_active, last_login_at, created_at, updated_at
        FROM users 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await db.query<UserEntity>(query, [userId]);
      
      const userEntity = result.rows[0];
      if (!userEntity) {
        return null;
      }
      
      return this.entityToUser(userEntity);
    } catch (error) {
      logger.error('Failed to find user by ID:', error);
      throw error;
    }
  }

  /**
   * Update user's last login time
   */
  static async updateLastLogin(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE users 
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `;
      
      await db.query(query, [userId]);
    } catch (error) {
      logger.error('Failed to update last login:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(
    userId: string,
    profileData: UpdateProfileRequest
  ): Promise<User | null> {
    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      // Build dynamic update query
      if (profileData.displayName !== undefined) {
        updateFields.push(`display_name = $${paramIndex++}`);
        values.push(profileData.displayName);
      }
      
      if (profileData.bio !== undefined) {
        updateFields.push(`bio = $${paramIndex++}`);
        values.push(profileData.bio);
      }
      
      if (profileData.website !== undefined) {
        updateFields.push(`website = $${paramIndex++}`);
        values.push(profileData.website);
      }
      
      if (profileData.location !== undefined) {
        updateFields.push(`location = $${paramIndex++}`);
        values.push(profileData.location);
      }

      if (updateFields.length === 0) {
        return await this.findById(userId);
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND is_active = true
        RETURNING id, username, email, display_name, profile_picture,
                 bio, website, location, birth_date, is_email_verified,
                 is_active, last_login_at, created_at, updated_at
      `;
      
      const result = await db.query<UserEntity>(query, values);
      
      const userEntity = result.rows[0];
      if (!userEntity) {
        return null;
      }
      
      logger.info('User profile updated:', {
        userId,
        updatedFields: Object.keys(profileData),
      });
      
      return this.entityToUser(userEntity);
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    try {
      // First, verify current password
      const user = await this.findUserEntityById(userId);
      if (!user) {
        return false;
      }

      const isCurrentPasswordValid = await AuthUtils.verifyPassword(
        currentPassword,
        user.passwordHash
      );

      if (!isCurrentPasswordValid) {
        return false;
      }

      // Hash new password
      const hashedNewPassword = await AuthUtils.hashPassword(newPassword);

      // Update password in database
      const query = `
        UPDATE users 
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
      `;
      
      await db.query(query, [hashedNewPassword, userId]);
      
      logger.info('User password changed:', { userId });
      
      return true;
    } catch (error) {
      logger.error('Failed to change user password:', error);
      throw error;
    }
  }

  /**
   * Check if email exists
   */
  static async emailExists(email: string): Promise<boolean> {
    try {
      const query = `
        SELECT 1 FROM users WHERE email = $1 LIMIT 1
      `;
      
      const result = await db.query(query, [email.toLowerCase()]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Failed to check if email exists:', error);
      throw error;
    }
  }

  /**
   * Check if username exists
   */
  static async usernameExists(username: string): Promise<boolean> {
    try {
      const query = `
        SELECT 1 FROM users WHERE username = $1 LIMIT 1
      `;
      
      const result = await db.query(query, [username.toLowerCase()]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Failed to check if username exists:', error);
      throw error;
    }
  }

  /**
   * Deactivate user account
   */
  static async deactivateUser(userId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE users 
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
      `;
      
      const result = await db.query(query, [userId]);
      
      logger.info('User account deactivated:', { userId });
      
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('Failed to deactivate user:', error);
      throw error;
    }
  }

  /**
   * Create user session in database
   */
  static async createUserSession(sessionData: {
    userId: string;
    sessionId: string;
    refreshToken: string;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
    rememberMe: boolean;
    expiresAt: Date;
  }): Promise<UserSessionEntity> {
    try {
      const sessionId = uuidv4();
      const query = `
        INSERT INTO user_sessions (
          id, user_id, session_id, refresh_token, user_agent, ip_address,
          is_active, remember_me, expires_at, created_at, last_accessed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *
      `;
      
      const values = [
        sessionId,
        sessionData.userId,
        sessionData.sessionId,
        sessionData.refreshToken,
        sessionData.userAgent || null,
        sessionData.ipAddress || null,
        true,
        sessionData.rememberMe,
        sessionData.expiresAt,
      ];
      
      const result = await db.query<UserSessionEntity>(query, values);
      
      const sessionEntity = result.rows[0];
      if (!sessionEntity) {
        throw new Error('Failed to create user session');
      }
      
      return sessionEntity;
    } catch (error) {
      logger.error('Failed to create user session:', error);
      throw error;
    }
  }

  /**
   * Find user session by session ID
   */
  static async findUserSession(sessionId: string): Promise<UserSessionEntity | null> {
    try {
      const query = `
        SELECT * FROM user_sessions 
        WHERE session_id = $1 AND is_active = true AND expires_at > NOW()
      `;
      
      const result = await db.query<UserSessionEntity>(query, [sessionId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user session:', error);
      throw error;
    }
  }

  /**
   * Update session last accessed time
   */
  static async updateSessionLastAccessed(sessionId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_sessions 
        SET last_accessed_at = NOW()
        WHERE session_id = $1
      `;
      
      await db.query(query, [sessionId]);
    } catch (error) {
      logger.error('Failed to update session last accessed:', error);
      throw error;
    }
  }

  /**
   * Deactivate user session
   */
  static async deactivateSession(sessionId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_sessions 
        SET is_active = false
        WHERE session_id = $1
      `;
      
      await db.query(query, [sessionId]);
    } catch (error) {
      logger.error('Failed to deactivate session:', error);
      throw error;
    }
  }

  /**
   * Deactivate all user sessions
   */
  static async deactivateAllUserSessions(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_sessions 
        SET is_active = false
        WHERE user_id = $1
      `;
      
      await db.query(query, [userId]);
    } catch (error) {
      logger.error('Failed to deactivate all user sessions:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  /**
   * Convert UserEntity to User (without sensitive data)
   */
  private static entityToUser(entity: UserEntity): User {
    return {
      id: entity.id,
      username: entity.username,
      email: entity.email,
      displayName: entity.displayName || undefined,
      profilePicture: entity.profilePicture || undefined,
      isEmailVerified: entity.isEmailVerified,
      isActive: entity.isActive,
      lastLoginAt: entity.lastLoginAt || undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Find user entity by ID (includes password hash)
   */
  private static async findUserEntityById(userId: string): Promise<UserEntity | null> {
    try {
      const query = `
        SELECT * FROM users 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await db.query<UserEntity>(query, [userId]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to find user entity by ID:', error);
      throw error;
    }
  }
}
