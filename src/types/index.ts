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

// Video metadata types
export interface VideoMetadata {
  id: string;
  filename: string;
  originalName: string;
  format: string;
  duration: number; // seconds
  size: number; // bytes
  width: number;
  height: number;
  bitrate: number;
  codec: string;
  audioCodec?: string;
  frameRate: number;
  createdAt: string;
  updatedAt: string;
  hlsPath?: string;
  thumbnailPath?: string;
  isProcessed: boolean;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

// Video processing job
export interface VideoProcessingJob {
  id: string;
  videoId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  error?: string;
  outputPaths: string[];
}

// HLS segment information
export interface HlsSegment {
  index: number;
  duration: number;
  url: string;
  byteRange?: {
    start: number;
    end: number;
  };
}

// HLS playlist information
export interface HlsPlaylist {
  segments: HlsSegment[];
  targetDuration: number;
  mediaSequence: number;
  version: number;
  isLive: boolean;
  endList: boolean;
}

// Stream quality variant
export interface StreamVariant {
  resolution: string;
  bandwidth: number;
  codecs: string;
  playlistUrl: string;
}

// Live stream information
export interface LiveStream {
  id: string;
  channelName: string;
  title?: string;
  description?: string;
  isActive: boolean;
  startedAt?: string;
  endedAt?: string;
  variants: StreamVariant[];
  viewerCount?: number;
}

// Request validation schemas
export const uploadVideoSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).max(10).optional(),
});
