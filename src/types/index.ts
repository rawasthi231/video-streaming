import { z } from 'zod';

// API Response standardization
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
    requestId?: string | undefined;
  };
}

// Video metadata interface - simplified for external service delegation
export interface VideoMetadata {
  id: string;
  filename: string;
  originalName: string;
  title?: string;
  description?: string;
  duration?: number;
  size?: number;
  createdAt: string;
  updatedAt: string;
  hlsPath?: string;
  thumbnailPath?: string;
  processingStatus?: string;
}

// ==========================================
// AUTHENTICATION & USER TYPES
// ==========================================

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string | undefined;
  profilePicture?: string | undefined;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends User {
  bio?: string;
  website?: string;
  location?: string;
  birthDate?: Date;
  subscribersCount?: number;
  videosCount?: number;
  totalViews?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface UserSession {
  userId: string;
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  isActive: boolean;
  rememberMe: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface JWTPayload {
  userId: string;
  sessionId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

// Request/Response types
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName?: string | undefined;
  agreeToTerms: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean | undefined;
}

export interface RefreshTokenRequest {
  refreshToken?: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
  session: {
    sessionId: string;
    expiresAt: string;
  };
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  bio?: string;
  website?: string;
  location?: string;
}

// Database entities
export interface UserEntity {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  profilePicture?: string;
  bio?: string;
  website?: string;
  location?: string;
  birthDate?: Date;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiresAt?: Date;
  passwordResetToken?: string;
  passwordResetExpiresAt?: Date;
  isActive: boolean;
  lastLoginAt?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSessionEntity {
  id: string;
  userId: string;
  sessionId: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  isActive: boolean;
  rememberMe: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastAccessedAt: Date;
}

// Authentication validation schemas
export const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: 'You must agree to the terms and conditions'
  })
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional(),
  location: z.string().max(100).optional()
});

// ==========================================
// CHANNEL & SUBSCRIPTION TYPES
// ==========================================

export interface Channel {
  id: string;
  userId: string;
  handle: string;
  name: string;
  description?: string | undefined;
  avatarUrl?: string | undefined;
  bannerUrl?: string | undefined;
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelEntity {
  id: string;
  userId: string;
  handle: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  subscriberId: string;
  channelId: string;
  isActive: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionWithChannel extends Subscription {
  channel: Channel;
}

export interface SubscriptionWithUser extends Subscription {
  subscriber: User;
}

// Channel request/response types
export interface CreateChannelRequest {
  handle: string;
  name: string;
  description?: string | undefined;
}

export interface UpdateChannelRequest {
  name?: string | undefined;
  description?: string | undefined;
  avatarUrl?: string | undefined;
  bannerUrl?: string | undefined;
}

export interface ChannelStats {
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
  totalWatchTime: number;
  averageViewDuration: number;
}

export interface SubscriptionRequest {
  channelId: string;
  notificationsEnabled?: boolean;
}

// Channel validation schemas
export const createChannelSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional()
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional()
});

export const subscriptionSchema = z.object({
  channelId: z.string().uuid(),
  notificationsEnabled: z.boolean().optional()
});
