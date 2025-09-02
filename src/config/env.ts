import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variable schema with defaults
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  
  // Video configuration
  VIDEO_STORAGE_PATH: z.string().default('./videos'),
  HLS_OUTPUT_PATH: z.string().default('./hls'),
  MAX_FILE_SIZE: z.coerce.number().default(1024 * 1024 * 1024), // 1GB
  SUPPORTED_FORMATS: z.string().default('mp4,webm,mkv,avi,mov'),
  
  // Security
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8080'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // Load testing / CPU burn
  BURN_DEFAULT_MS: z.coerce.number().default(200),
  BURN_MAX_MS: z.coerce.number().default(5000),
  
  // FFmpeg configuration
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs'),
  
  // Metrics
  METRICS_PORT: z.coerce.number().default(9090),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const ENV = parsedEnv.data;

// Constants derived from environment
export const CONSTANTS = {
  API_PREFIX: '/api/v1',
  HEALTH_ENDPOINTS: {
    LIVENESS: '/health',
    READINESS: '/ready',
  },
  VIDEO_FORMATS: ENV.SUPPORTED_FORMATS.split(','),
  CORS_ORIGINS: ENV.CORS_ORIGINS.split(','),
  
  // HLS Configuration
  HLS_SEGMENT_DURATION: 4, // seconds
  HLS_PLAYLIST_SIZE: 5, // number of segments
  
  // Bitrate ladder for adaptive streaming
  BITRATE_LADDER: [
    { resolution: '426x240', videoBitrate: '400k', audioBitrate: '64k', name: '240p' },
    { resolution: '640x360', videoBitrate: '800k', audioBitrate: '96k', name: '360p' },
    { resolution: '854x480', videoBitrate: '1200k', audioBitrate: '128k', name: '480p' },
    { resolution: '1280x720', videoBitrate: '2500k', audioBitrate: '128k', name: '720p' },
    { resolution: '1920x1080', videoBitrate: '5000k', audioBitrate: '192k', name: '1080p' },
  ],
} as const;

export type Environment = typeof ENV;
