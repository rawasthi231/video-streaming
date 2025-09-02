import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ENV, CONSTANTS } from '../config/env.js';
import { logger } from '../config/logger.js';
import { metrics } from '../config/metrics.js';
import { VideoMetadata, VideoProcessingJob } from '../types/index.js';

// Set FFmpeg paths if provided
if (ENV.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(ENV.FFMPEG_PATH);
}
if (ENV.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(ENV.FFPROBE_PATH);
}

export class VideoService {
  private processingJobs = new Map<string, VideoProcessingJob>();

  constructor() {
    this.ensureDirectories();
  }

  // Ensure required directories exist
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(ENV.VIDEO_STORAGE_PATH, { recursive: true });
      await fs.mkdir(ENV.HLS_OUTPUT_PATH, { recursive: true });
      await fs.mkdir(path.join(ENV.HLS_OUTPUT_PATH, 'thumbnails'), { recursive: true });
      logger.info('Video directories initialized', {
        videoPath: ENV.VIDEO_STORAGE_PATH,
        hlsPath: ENV.HLS_OUTPUT_PATH,
      });
    } catch (error) {
      logger.error('Failed to create video directories', { error });
      throw error;
    }
  }

  // Get video metadata using FFprobe
  async getVideoMetadata(filePath: string): Promise<Partial<VideoMetadata>> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          logger.error('FFprobe failed', { filePath, error: err });
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        const result: Partial<VideoMetadata> = {
          duration: metadata.format.duration || 0,
          size: parseInt(metadata.format.size?.toString() || '0'),
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          bitrate: parseInt(metadata.format.bit_rate?.toString() || '0'),
          codec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name || 'unknown',
          frameRate: this.parseFrameRate(videoStream.r_frame_rate),
        };

        resolve(result);
      });
    });
  }

  // Parse frame rate from FFmpeg format (e.g., "30/1" -> 30)
  private parseFrameRate(frameRateStr?: string): number {
    if (!frameRateStr) return 0;
    const [num, den = '1'] = frameRateStr.split('/');
    return Math.round(parseInt(num || '0') / parseInt(den || '1'));
  }

  // Convert video to HLS format with multiple bitrates
  async convertToHLS(
    inputPath: string,
    outputDir: string,
    videoId: string
  ): Promise<string[]> {
    const jobId = uuidv4();
    const job: VideoProcessingJob = {
      id: jobId,
      videoId,
      status: 'processing',
      progress: 0,
      startedAt: new Date().toISOString(),
      outputPaths: [],
    };

    this.processingJobs.set(jobId, job);
    metrics.videoProcessingJobs.inc({ status: 'processing' });

    try {
      const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
      const outputPaths: string[] = [];

      // Create adaptive bitrate streams
      const promises = CONSTANTS.BITRATE_LADDER.map(async (variant, index) => {
        const variantDir = path.join(outputDir, variant.name);
        await fs.mkdir(variantDir, { recursive: true });

        const playlistPath = path.join(variantDir, 'playlist.m3u8');
        const segmentPattern = path.join(variantDir, 'segment_%03d.ts');

        return new Promise<void>((resolve, reject) => {
          ffmpeg(inputPath)
            .outputOptions([
              `-c:v libx264`,
              `-c:a aac`,
              `-b:v ${variant.videoBitrate}`,
              `-b:a ${variant.audioBitrate}`,
              `-s ${variant.resolution}`,
              `-f hls`,
              `-hls_time ${CONSTANTS.HLS_SEGMENT_DURATION}`,
              `-hls_list_size ${CONSTANTS.HLS_PLAYLIST_SIZE}`,
              `-hls_segment_filename ${segmentPattern}`,
            ])
            .output(playlistPath)
            .on('progress', (progress) => {
              const overallProgress = Math.round(
                ((index + (progress.percent || 0) / 100) / CONSTANTS.BITRATE_LADDER.length) * 100
              );
              job.progress = overallProgress;
              logger.debug('Video processing progress', {
                jobId,
                videoId,
                variant: variant.name,
                progress: overallProgress,
              });
            })
            .on('end', () => {
              outputPaths.push(playlistPath);
              logger.info('Variant processing completed', {
                jobId,
                videoId,
                variant: variant.name,
                outputPath: playlistPath,
              });
              resolve();
            })
            .on('error', (err) => {
              logger.error('FFmpeg error during variant processing', {
                jobId,
                videoId,
                variant: variant.name,
                error: err,
              });
              reject(err);
            })
            .run();
        });
      });

      // Wait for all variants to complete
      await Promise.all(promises);

      // Generate master playlist
      await this.generateMasterPlaylist(outputDir, masterPlaylistPath);
      outputPaths.push(masterPlaylistPath);

      // Generate thumbnail
      const thumbnailPath = await this.generateThumbnail(inputPath, outputDir);
      if (thumbnailPath) {
        outputPaths.push(thumbnailPath);
      }

      // Update job status
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.outputPaths = outputPaths;

      metrics.videoProcessingJobs.dec({ status: 'processing' });
      metrics.videoProcessingJobs.inc({ status: 'completed' });

      logger.info('Video processing completed', {
        jobId,
        videoId,
        outputPaths,
        duration: Date.now() - new Date(job.startedAt!).getTime(),
      });

      return outputPaths;
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date().toISOString();

      metrics.videoProcessingJobs.dec({ status: 'processing' });
      metrics.videoProcessingJobs.inc({ status: 'failed' });

      logger.error('Video processing failed', {
        jobId,
        videoId,
        error,
      });

      throw error;
    }
  }

  // Generate master playlist for adaptive bitrate streaming
  private async generateMasterPlaylist(
    outputDir: string,
    masterPlaylistPath: string
  ): Promise<void> {
    const masterContent = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '',
    ];

    for (const variant of CONSTANTS.BITRATE_LADDER) {
      const bandwidth = parseInt(variant.videoBitrate.replace('k', '000')) + 
                       parseInt(variant.audioBitrate.replace('k', '000'));
      
      masterContent.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${variant.resolution},CODECS="avc1.42e00a,mp4a.40.2"`,
        `${variant.name}/playlist.m3u8`,
        ''
      );
    }

    await fs.writeFile(masterPlaylistPath, masterContent.join('\n'));
    logger.info('Master playlist generated', { masterPlaylistPath });
  }

  // Generate thumbnail from video
  private async generateThumbnail(
    inputPath: string,
    outputDir: string
  ): Promise<string | null> {
    try {
      const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
      
      return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .screenshots({
            timestamps: ['25%'],
            filename: 'thumbnail.jpg',
            folder: outputDir,
            size: '320x180',
          })
          .on('end', () => {
            logger.info('Thumbnail generated', { thumbnailPath });
            resolve(thumbnailPath);
          })
          .on('error', (err) => {
            logger.warn('Thumbnail generation failed', { error: err });
            resolve(null);
          });
      });
    } catch (error) {
      logger.warn('Thumbnail generation error', { error });
      return null;
    }
  }

  // Get processing job status
  getProcessingJob(jobId: string): VideoProcessingJob | undefined {
    return this.processingJobs.get(jobId);
  }

  // Get all processing jobs
  getAllProcessingJobs(): VideoProcessingJob[] {
    return Array.from(this.processingJobs.values());
  }

  // Clean up old completed jobs (call periodically)
  cleanupOldJobs(maxAgeHours: number = 24): void {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    for (const [jobId, job] of this.processingJobs.entries()) {
      if (job.completedAt) {
        const completedTime = new Date(job.completedAt).getTime();
        if (completedTime < cutoff) {
          this.processingJobs.delete(jobId);
          logger.debug('Cleaned up old processing job', { jobId });
        }
      }
    }
  }
}
