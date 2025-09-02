import { Router } from 'express';
import { UtilityController } from '../controllers/utility-controller.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validate, commonSchemas } from '../middlewares/validation.js';

const router = Router();
const utilityController = new UtilityController();

/**
 * @swagger
 * tags:
 *   name: Utilities
 *   description: Health checks, metrics, and utility endpoints
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness probe endpoint
 *     tags: [Utilities]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/health', asyncHandler(utilityController.healthCheck));

/**
 * @swagger
 * /ready:
 *   get:
 *     summary: Readiness probe endpoint
 *     tags: [Utilities]
 *     responses:
 *       200:
 *         description: Service is ready to handle requests
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', asyncHandler(utilityController.readinessCheck));

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     tags: [Utilities]
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 */
router.get('/metrics', asyncHandler(utilityController.metricsEndpoint));

/**
 * @swagger
 * /burn:
 *   get:
 *     summary: CPU burn endpoint for load testing
 *     tags: [Utilities]
 *     parameters:
 *       - in: query
 *         name: ms
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 200
 *         description: Duration to burn CPU in milliseconds
 *     responses:
 *       200:
 *         description: CPU burn completed successfully
 */
router.get(
  '/burn',
  validate({ query: commonSchemas.burnCpu }),
  asyncHandler(utilityController.burnCpu)
);

/**
 * @swagger
 * /system:
 *   get:
 *     summary: Get system information
 *     tags: [Utilities]
 *     responses:
 *       200:
 *         description: System information retrieved successfully
 */
router.get('/system', asyncHandler(utilityController.getSystemInfo));

export { router as utilityRoutes };
