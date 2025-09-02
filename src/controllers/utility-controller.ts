import { Request, Response } from 'express';
import { spawn } from 'child_process';
import { metrics, metricsRegistry } from '../config/metrics.js';
import { logger } from '../config/logger.js';
import { ENV } from '../config/env.js';
import { ApiResponse } from '../types/index.js';
import { AppError } from '../middlewares/error-handler.js';
import { userTracker } from '../middlewares/concurrent-users.js';

export class UtilityController {
  // Health check endpoint for liveness probe
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    const response: ApiResponse<{ status: string; timestamp: string }> = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(response);
  };

  // Readiness check endpoint for readiness probe
  readinessCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check if FFmpeg is available
      const ffmpegAvailable = await this.checkFFmpegAvailability();
      
      if (!ffmpegAvailable) {
        throw new AppError('FFmpeg not available', 503, 'FFMPEG_UNAVAILABLE');
      }

      const response: ApiResponse<{ 
        status: string; 
        timestamp: string; 
        services: Record<string, boolean> 
      }> = {
        success: true,
        data: {
          status: 'ready',
          timestamp: new Date().toISOString(),
          services: {
            ffmpeg: ffmpegAvailable,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Readiness check failed', 503, 'READINESS_CHECK_ERROR');
    }
  };

  // Prometheus metrics endpoint
  metricsEndpoint = async (req: Request, res: Response): Promise<void> => {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      const metrics = await metricsRegistry.metrics();
      res.end(metrics);
    } catch (error) {
      throw new AppError('Failed to generate metrics', 500, 'METRICS_ERROR');
    }
  };

  // CPU burn endpoint for load testing
  burnCpu = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ms = ENV.BURN_DEFAULT_MS } = req.query;
      const burnDuration = Math.max(1, Math.min(ENV.BURN_MAX_MS, Number(ms)));
      
      const start = Date.now();
      let iterations = 0;
      
      // CPU-intensive calculations
      while (Date.now() - start < burnDuration) {
        iterations += Math.sqrt(Math.random() * 1000);
        // Additional CPU work
        for (let i = 0; i < 1000; i++) {
          Math.sin(i) * Math.cos(i);
        }
      }
      
      const actualDuration = Date.now() - start;
      
      // Track CPU burn metrics
      metrics.cpuBurnRequests.inc({ duration_ms: burnDuration.toString() });
      
      const response: ApiResponse<{
        requestedMs: number;
        actualMs: number;
        iterations: number;
        timestamp: string;
      }> = {
        success: true,
        data: {
          requestedMs: burnDuration,
          actualMs: actualDuration,
          iterations: Math.round(iterations),
          timestamp: new Date().toISOString(),
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      logger.info('CPU burn completed', {
        requestedMs: burnDuration,
        actualMs: actualDuration,
        iterations: Math.round(iterations),
      });

      res.json(response);
    } catch (error) {
      throw new AppError('CPU burn failed', 500, 'CPU_BURN_ERROR');
    }
  };

  // Get concurrent users statistics
  getConcurrentUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = userTracker.getCurrentStats();
      
      const response: ApiResponse<typeof stats> = {
        success: true,
        data: stats,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      throw new AppError('Failed to get concurrent user stats', 500, 'CONCURRENT_USERS_ERROR');
    }
  };

  // Get system information
  getSystemInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const response: ApiResponse<{
        environment: string;
        nodeVersion: string;
        platform: string;
        architecture: string;
        uptime: number;
        memory: NodeJS.MemoryUsage;
        pid: number;
      }> = {
        success: true,
        data: {
          environment: ENV.NODE_ENV,
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      throw new AppError('Failed to get system info', 500, 'SYSTEM_INFO_ERROR');
    }
  };

  // Check FFmpeg availability
  private async checkFFmpegAvailability(): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-version']);
        
        ffmpeg.on('close', (code: number) => {
          resolve(code === 0);
        });
        
        ffmpeg.on('error', () => {
          resolve(false);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          ffmpeg.kill();
          resolve(false);
        }, 5000);
      });
    } catch (error) {
      return false;
    }
  }
}
