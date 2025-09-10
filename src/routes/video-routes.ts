import { Router } from 'express';
import { VideoController } from '../controllers/video-controller.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validate, commonSchemas } from '../middlewares/validation.js';

const router = Router();
const videoController = new VideoController();

// Video processing is now handled by external Java service
// This service provides API delegation endpoints

/**
 * @swagger
 * tags:
 *   name: Videos
 *   description: Video streaming and management endpoints
 */

/**
 * @swagger
 * /api/v1/videos:
 *   get:
 *     summary: Get list of videos
 *     tags: [Videos]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of videos per page
 *     responses:
 *       200:
 *         description: List of videos retrieved successfully
 */
router.get(
  '/',
  validate({ query: commonSchemas.pagination }),
  asyncHandler(videoController.getVideos)
);

/**
 * @swagger
 * /api/v1/videos/{id}:
 *   get:
 *     summary: Get video by ID
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Video ID
 *     responses:
 *       200:
 *         description: Video retrieved successfully
 *       404:
 *         description: Video not found
 */
router.get(
  '/:id',
  validate({ params: commonSchemas.videoId }),
  asyncHandler(videoController.getVideoById)
);

/**
 * @swagger
 * /api/v1/videos/upload:
 *   post:
 *     summary: Upload a new video (delegates to external processing service)
 *     tags: [Videos]
 *     description: This endpoint delegates video uploads to the external Java video processing service
 *     responses:
 *       302:
 *         description: Redirect to external video processing service
 *       503:
 *         description: External video processing service not configured
 */
router.post(
  '/upload',
  asyncHandler(videoController.uploadVideo)
);

/**
 * @swagger
 * /api/v1/videos/stream/{filename}:
 *   get:
 *     summary: Stream video file (redirects to external service)
 *     tags: [Videos]
 *     description: This endpoint redirects video streaming requests to the external Java service
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Video filename
 *     responses:
 *       302:
 *         description: Redirect to external video streaming service
 *       503:
 *         description: External video service not configured
 */
router.get(
  '/stream/:filename',
  asyncHandler(videoController.streamVideo)
);

export { router as videoRoutes };
