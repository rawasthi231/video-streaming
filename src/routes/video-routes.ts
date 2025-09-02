import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { VideoController } from '../controllers/video-controller.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validate, commonSchemas } from '../middlewares/validation.js';
import { ENV, CONSTANTS } from '../config/env.js';

const router = Router();
const videoController = new VideoController();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: ENV.MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = CONSTANTS.VIDEO_FORMATS;
    const fileExt = path.extname(file.originalname).slice(1).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file format. Allowed: ${allowedTypes.join(', ')}`));
    }
  },
});

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
 *     summary: Upload a new video
 *     tags: [Videos]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: video
 *         type: file
 *         required: true
 *         description: Video file to upload
 *       - in: formData
 *         name: title
 *         type: string
 *         description: Video title
 *       - in: formData
 *         name: description
 *         type: string
 *         description: Video description
 *     responses:
 *       201:
 *         description: Video uploaded successfully
 *       400:
 *         description: Invalid file or missing required fields
 */
router.post(
  '/upload',
  upload.single('video'),
  validate({ body: commonSchemas.fileUpload }),
  asyncHandler(videoController.uploadVideo)
);

/**
 * @swagger
 * /api/v1/videos/stream/{filename}:
 *   get:
 *     summary: Stream video file with range support
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Video filename
 *       - in: header
 *         name: Range
 *         schema:
 *           type: string
 *         description: HTTP Range header for partial content
 *     responses:
 *       200:
 *         description: Video stream (full content)
 *       206:
 *         description: Video stream (partial content)
 *       404:
 *         description: Video file not found
 */
router.get(
  '/stream/:filename',
  asyncHandler(videoController.streamVideo)
);

export { router as videoRoutes };
