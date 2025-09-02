import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { VideoService } from "../services/video-service.js";
import { logger } from "../config/logger.js";
import { metrics } from "../config/metrics.js";
import { ENV, CONSTANTS } from "../config/env.js";
import { ApiResponse, VideoMetadata } from "../types/index.js";
import { AppError } from "../middlewares/error-handler.js";

export class VideoController {
  private videoService: VideoService;
  private videoMetadata = new Map<string, VideoMetadata>();

  constructor() {
    this.videoService = new VideoService();
    this.initializeExistingVideos();
  }

  // Initialize metadata for existing videos
  private async initializeExistingVideos(): Promise<void> {
    try {
      const hlsPath = ENV.HLS_OUTPUT_PATH || "./hls";
      const entries = await fs.promises.readdir(hlsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && this.isValidUUID(entry.name)) {
          const videoId = entry.name;
          const videoDir = path.join(hlsPath, videoId);
          const masterPlaylist = path.join(videoDir, "master.m3u8");
          const thumbnail = path.join(videoDir, "thumbnail.jpg");
          
          // Check if master playlist exists
          if (await this.fileExists(masterPlaylist)) {
            try {
              // Try to get metadata from thumbnail or use defaults
              const metadata = await this.getVideoMetadataFromDirectory(videoDir);
              
              this.videoMetadata.set(videoId, {
                id: videoId,
                filename: `${videoId}.m3u8`,
                originalName: metadata.originalName || `Video ${videoId.slice(0, 8)}`,
                format: "hls",
                duration: metadata.duration || 0,
                size: metadata.size || 0,
                width: metadata.width || 1920,
                height: metadata.height || 1080,
                bitrate: metadata.bitrate || 0,
                codec: metadata.codec || "h264",
                audioCodec: metadata.audioCodec || "aac",
                frameRate: metadata.frameRate || 30,
                createdAt: metadata.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isProcessed: true,
                processingStatus: "completed",
                hlsPath: `/video/${videoId}/master.m3u8`,
                thumbnailPath: await this.fileExists(thumbnail) ? `/video/${videoId}/thumbnail.jpg` : undefined,
              } as VideoMetadata);
            } catch (error) {
              logger.warn(`Failed to load metadata for video ${videoId}`, { error });
            }
          }
        }
      }
      
      logger.info("Initialized existing videos", {
        count: this.videoMetadata.size,
        videos: Array.from(this.videoMetadata.keys())
      });
    } catch (error) {
      logger.warn("Failed to initialize existing videos", { error });
    }
  }

  // Get list of all videos
  getVideos = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const videos = Array.from(this.videoMetadata.values());

      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedVideos = videos.slice(startIndex, endIndex);

      const response: ApiResponse<VideoMetadata[]> = {
        success: true,
        data: paginatedVideos,
        meta: {
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: videos.length,
            totalPages: Math.ceil(videos.length / Number(limit)),
          },
          timestamp: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      throw new AppError("Failed to fetch videos", 500, "VIDEO_FETCH_ERROR");
    }
  };

  // Get single video metadata
  getVideoById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const video = this.videoMetadata.get(id as string);

      if (!video) {
        throw new AppError("Video not found", 404, "VIDEO_NOT_FOUND");
      }

      const response: ApiResponse<VideoMetadata> = {
        success: true,
        data: video,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Failed to fetch video", 500, "VIDEO_FETCH_ERROR");
    }
  };

  // Stream video with range support
  streamVideo = async (req: Request, res: Response): Promise<void> => {
    try {
      const baseDir = fs.realpathSync(ENV.HLS_OUTPUT_PATH || "./hls");
      const requestedFilename = req.params?.filename || "";

      if (!requestedFilename || requestedFilename.includes("\0")) {
        throw new AppError("Filename is required", 400, "MISSING_FILENAME");
      }
      // Only allow direct filenames, no path separators
      const safeName = path.basename(requestedFilename);

      if (safeName !== requestedFilename) {
        throw new AppError("Invalid file path", 400, "INVALID_FILE_PATH");
      }
      // nosemgrep: codacy.tools-configs.javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal
      // Justification: Only a basename is allowed (no separators), baseDir is realpathed. This join cannot traverse outside baseDir.
      const videoPath = path.join(baseDir, safeName);

      // Check if file exists
      if (!fs.existsSync(videoPath)) {
        throw new AppError("Video file not found", 404, "VIDEO_FILE_NOT_FOUND");
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Set proper content type based on file extension
      const ext = path.extname(videoPath).toLowerCase();
      const contentType = this.getContentType(ext);

      if (range) {
        // Parse range header (e.g., "bytes=0-1023")
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0] || "0", 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        // Create read stream for the requested range
        const file = fs.createReadStream(videoPath, { start, end });

        // Set partial content headers
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        });

        // Track streaming metrics
        file.on("data", (chunk) => {
          metrics.videoBytesStreamed.inc(
            { video_id: req.params?.filename || "", quality: "original" },
            chunk.length
          );
        });

        file.pipe(res);
      } else {
        // Send entire file
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        });

        const file = fs.createReadStream(videoPath);

        file.on("data", (chunk) => {
          metrics.videoBytesStreamed.inc(
            { video_id: req.params?.filename || "", quality: "original" },
            chunk.length
          );
        });

        file.pipe(res);
      }

      // Track active streams
      metrics.activeStreams.inc({ video_id: req.params?.filename || "" });

      res.on("close", () => {
        metrics.activeStreams.dec({ video_id: req.params?.filename || "" });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Failed to stream video", 500, "VIDEO_STREAM_ERROR");
    }
  };

  // Upload and process new video
  uploadVideo = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError("No video file provided", 400, "MISSING_VIDEO_FILE");
      }

      const { title, description, tags } = req.body;
      const videoId = uuidv4();
      const outputDir = path.join(ENV.HLS_OUTPUT_PATH, videoId);

      // Create video metadata
      const videoMetadata: VideoMetadata = {
        id: videoId,
        filename: `${videoId}.${path.extname(req.file.originalname).slice(1)}`,
        originalName: req.file.originalname,
        format: path.extname(req.file.originalname).slice(1),
        duration: 0,
        size: req.file.size,
        width: 0,
        height: 0,
        bitrate: 0,
        codec: "unknown",
        frameRate: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isProcessed: false,
        processingStatus: "pending",
      };

      // Get metadata from uploaded file
      try {
        const metadata = await this.videoService.getVideoMetadata(
          req.file.path
        );
        Object.assign(videoMetadata, metadata);
      } catch (error) {
        logger.warn("Failed to extract video metadata", { error, videoId });
      }

      // Store metadata
      this.videoMetadata.set(videoId, videoMetadata);

      // Start async processing
      this.processVideoAsync(req.file.path, outputDir, videoId);

      const response: ApiResponse<VideoMetadata> = {
        success: true,
        data: videoMetadata,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };

      res.status(201).json(response);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Failed to upload video", 500, "VIDEO_UPLOAD_ERROR");
    }
  };

  // Process video asynchronously
  private async processVideoAsync(
    inputPath: string,
    outputDir: string,
    videoId: string
  ): Promise<void> {
    try {
      const video = this.videoMetadata.get(videoId);
      if (!video) return;

      video.processingStatus = "processing";
      this.videoMetadata.set(videoId, video);

      await this.videoService.convertToHLS(inputPath, outputDir, videoId);

      video.processingStatus = "completed";
      video.isProcessed = true;
      video.hlsPath = `/video/${videoId}/master.m3u8`;
      video.updatedAt = new Date().toISOString();

      this.videoMetadata.set(videoId, video);

      // Clean up original uploaded file
      await fs.promises.unlink(inputPath);

      logger.info("Video processing completed successfully", { videoId });
    } catch (error) {
      const video = this.videoMetadata.get(videoId);
      if (video) {
        video.processingStatus = "failed";
        this.videoMetadata.set(videoId, video);
      }

      logger.error("Video processing failed", { videoId, error });
    }
  }

  // Get content type based on file extension
  private getContentType(ext: string): string {
    const contentTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".avi": "video/x-msvideo",
      ".mov": "video/quicktime",
      ".m3u8": "application/vnd.apple.mpegurl",
      ".ts": "video/mp2t",
      ".m4s": "video/iso.segment",
      ".jpg": "image/jpeg",
      ".png": "image/png",
    };
    return contentTypes[ext] || "application/octet-stream";
  }

  // Check if a string is a valid UUID
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  // Check if file exists
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // Get video metadata from directory (placeholder for actual metadata extraction)
  private async getVideoMetadataFromDirectory(videoDir: string): Promise<Partial<VideoMetadata>> {
    try {
      // Try to read a metadata.json file if it exists
      const metadataPath = path.join(videoDir, "metadata.json");
      if (await this.fileExists(metadataPath)) {
        const metadataContent = await fs.promises.readFile(metadataPath, 'utf-8');
        return JSON.parse(metadataContent);
      }
      
      // Get file stats from master playlist for basic info
      const masterPath = path.join(videoDir, "master.m3u8");
      const stat = await fs.promises.stat(masterPath);
      
      return {
        createdAt: stat.birthtime.toISOString(),
        size: stat.size,
        originalName: `Processed Video ${path.basename(videoDir).slice(0, 8)}`,
        duration: 10, // Default duration - would need ffprobe to get actual
        width: 1920,
        height: 1080,
        codec: "h264",
        audioCodec: "aac",
        frameRate: 30,
        bitrate: 2000000
      };
    } catch (error) {
      logger.warn(`Failed to read metadata for ${videoDir}`, { error });
      return {
        originalName: `Video ${path.basename(videoDir).slice(0, 8)}`,
        duration: 0,
        size: 0,
        width: 1920,
        height: 1080
      };
    }
  }
}
