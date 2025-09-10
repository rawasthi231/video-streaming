import { Request, Response } from "express";
import { logger } from "../config/logger.js";
import { metrics } from "../config/metrics.js";
import { ENV, CONSTANTS } from "../config/env.js";
import { ApiResponse, VideoMetadata } from "../types/index.js";
import { AppError } from "../middlewares/error-handler.js";

export class VideoController {
  private videoMetadata = new Map<string, VideoMetadata>();

  constructor() {
    // Video processing is now handled by external Java service
    // This controller only handles API delegation
  }

  // Get videos from external video processing service
  private async getVideosFromExternalService(): Promise<VideoMetadata[]> {
    try {
      if (!ENV.VIDEO_PROCESSOR_URL) {
        logger.warn('VIDEO_PROCESSOR_URL not configured, returning empty list');
        return [];
      }

      const response = await fetch(`${ENV.VIDEO_PROCESSOR_URL.replace(/\/$/, '')}/api/v2/videos`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.content || [];
    } catch (error) {
      logger.error('Failed to fetch videos from external service', { error });
      return [];
    }
  }

  // Get list of all videos from external service
  getVideos = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      if (ENV.VIDEO_PROCESSOR_URL) {
        // Delegate to external video processing service
        const videoServiceUrl = `${ENV.VIDEO_PROCESSOR_URL.replace(/\/$/, '')}/api/v2/videos`;
        const serviceResponse = await fetch(`${videoServiceUrl}?page=${page}&size=${limit}`);
        
        if (!serviceResponse.ok) {
          throw new Error(`Video service returned ${serviceResponse.status}`);
        }
        
        const serviceData = await serviceResponse.json() as any;
        
        const response: ApiResponse<VideoMetadata[]> = {
          success: true,
          data: serviceData.content || [],
          meta: {
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: serviceData.totalElements || 0,
              totalPages: serviceData.totalPages || 0,
            },
            timestamp: new Date().toISOString(),
          },
        };
        
        res.json(response);
      } else {
        // Fallback to empty response if external service not configured
        const response: ApiResponse<VideoMetadata[]> = {
          success: true,
          data: [],
          meta: {
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              totalPages: 0,
            },
            timestamp: new Date().toISOString(),
          },
        };
        
        res.json(response);
      }
    } catch (error) {
      logger.error('Failed to fetch videos from external service', { error });
      throw new AppError("Failed to fetch videos", 500, "VIDEO_FETCH_ERROR");
    }
  };

  // Get single video metadata from external service
  getVideoById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (ENV.VIDEO_PROCESSOR_URL) {
        const videoServiceUrl = `${ENV.VIDEO_PROCESSOR_URL.replace(/\/$/, '')}/api/v2/videos/${id}`;
        const serviceResponse = await fetch(videoServiceUrl);
        
        if (serviceResponse.status === 404) {
          throw new AppError("Video not found", 404, "VIDEO_NOT_FOUND");
        }
        
        if (!serviceResponse.ok) {
          throw new Error(`Video service returned ${serviceResponse.status}`);
        }
        
        const video = await serviceResponse.json() as VideoMetadata;
        
        const response: ApiResponse<VideoMetadata> = {
          success: true,
          data: video,
          meta: {
            timestamp: new Date().toISOString(),
          },
        };

        res.json(response);
      } else {
        throw new AppError("Video service not configured", 503, "SERVICE_UNAVAILABLE");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to fetch video from external service', { error });
      throw new AppError("Failed to fetch video", 500, "VIDEO_FETCH_ERROR");
    }
  };

  // Video streaming is now handled by external Java service
  // This method provides a redirect to the external service
  streamVideo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { filename } = req.params;
      
      if (!ENV.VIDEO_PROCESSOR_URL) {
        throw new AppError("Video streaming service not configured", 503, "SERVICE_UNAVAILABLE");
      }
      
      // Redirect to external video streaming service
      const streamUrl = `${ENV.VIDEO_PROCESSOR_URL.replace(/\/$/, '')}/video/${filename}`;
      res.redirect(302, streamUrl);
      
      // Track redirect metrics
      metrics.activeStreams.inc({ video_id: filename || "" });
      
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Failed to stream video", 500, "VIDEO_STREAM_ERROR");
    }
  };

  // Upload video - redirect to external processing service
  uploadVideo = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!ENV.VIDEO_PROCESSOR_URL) {
        throw new AppError("Video processing service not configured", 503, "SERVICE_UNAVAILABLE");
      }
      
      // Redirect to external video processing service upload endpoint
      const uploadUrl = `${ENV.VIDEO_PROCESSOR_URL.replace(/\/$/, '')}/api/v1/videos/process`;
      res.redirect(302, uploadUrl);
      
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Failed to redirect to video processing service', { error });
      throw new AppError("Video processing service unavailable", 503, "SERVICE_UNAVAILABLE");
    }
  };

}
