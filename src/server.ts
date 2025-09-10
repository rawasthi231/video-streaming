import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";

import { ENV, CONSTANTS } from "./config/env.js";
import { logger } from "./config/logger.js";
import { metricsMiddleware } from "./config/metrics.js";
import { db } from "./config/database.js";
import { redis } from "./config/redis.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { concurrentUserMiddleware } from "./middlewares/concurrent-users.js";
import { videoRoutes } from "./routes/video-routes.js";
import { utilityRoutes } from "./routes/utility-routes.js";
import { authRoutes } from "./routes/auth-routes.js";
import { channelRoutes } from "./routes/channel-routes.js";
import { userRoutes } from "./routes/user-routes.js";

// Create Express application
const app = express();

// Ensure required directories exist
async function ensureDirectories(): Promise<void> {
  const dirs = ["logs"];

  for (const dir of dirs) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error(`Failed to create directory: ${dir}`, { error });
    }
  }
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "worker-src": ["'self'", "blob:"],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
      },
    },
    frameguard: { action: "deny" },
  })
);

// CORS configuration
app.use(
  cors({
    origin: CONSTANTS.CORS_ORIGINS,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: ENV.RATE_LIMIT_WINDOW_MS,
  max: ENV.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests from this IP, please try again later.",
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parsing middleware
app.use(cookieParser(ENV.COOKIE_SECRET));

// Metrics middleware
app.use(metricsMiddleware());

// Concurrent user tracking middleware
app.use(concurrentUserMiddleware());

// Request ID middleware
app.use((req, res, next) => {
  req.headers["x-request-id"] =
    req.headers["x-request-id"] ||
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  next();
});

// Swagger API documentation
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Video Streaming Autoscale Demo API",
      version: "1.0.0",
      description: "A video streaming service with Kubernetes HPA autoscaling",
      contact: {
        name: "Raghvendra Awasthi",
      },
    },
    servers: [
      {
        url: `http://localhost:${ENV.PORT}`,
        description: "Development server",
      },
      {
        url: "http://localhost:30080",
        description: "Kubernetes NodePort service",
      },
      {
        url: "http://localhost:8082",
        description: "Kubernetes NodePort service",
      },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

const specs = swaggerJsdoc(swaggerOptions);
// Serve the OpenAPI JSON explicitly to avoid proxy/port issues
app.get("/docs/openapi.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(specs);
});

// Configure Swagger UI to fetch the spec from the same-origin JSON endpoint
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerUrl: "/docs/openapi.json",
    explorer: true,
  })
);

// Note: Video streaming and static files are now handled by external services
// HLS content is served by the Java video processing service
// Frontend assets are served by the separate React frontend service

// API routes
app.use(CONSTANTS.API_PREFIX + "/auth", authRoutes);
app.use(CONSTANTS.API_PREFIX + "/users", userRoutes);
app.use(CONSTANTS.API_PREFIX + "/channels", channelRoutes);
app.use(CONSTANTS.API_PREFIX + "/videos", videoRoutes);

// Utility routes (health, metrics, etc.)
app.use("/", utilityRoutes);

// Simple API status endpoint for the streamlined service
app.get("/", (req, res) => {
  res.json({
    service: "Video Streaming Auth API",
    version: "2.0.0",
    status: "active",
    description: "Authentication and user management API for video streaming platform",
    endpoints: {
      docs: "/docs",
      health: "/health",
      metrics: "/metrics",
      auth: "/api/v1/auth",
      users: "/api/v1/users", 
      channels: "/api/v1/channels",
      videos: "/api/v1/videos"
    },
    externalServices: {
      videoProcessing: ENV.VIDEO_PROCESSOR_URL || "Not configured",
      frontend: "Separate React application"
    },
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Initialize database connections
async function initializeDatabases(): Promise<void> {
  try {
    // Test PostgreSQL connection
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      throw new Error('PostgreSQL connection failed');
    }
    logger.info('PostgreSQL connected successfully');

    // Test Redis connection
    const redisHealthy = await redis.healthCheck();
    if (!redisHealthy) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connected successfully');

    logger.info('All database connections initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

// Start server
async function startServer(): Promise<void> {
  try {
    // Initialize database connections
    await initializeDatabases();

    // Ensure directories exist
    await ensureDirectories();

    // Start HTTP server
    const server = app.listen(ENV.PORT, () => {
      logger.info("Server started successfully", {
        port: ENV.PORT,
        environment: ENV.NODE_ENV,
        pid: process.pid,
        endpoints: {
          api: `http://localhost:${ENV.PORT}${CONSTANTS.API_PREFIX}`,
          docs: `http://localhost:${ENV.PORT}/docs`,
          metrics: `http://localhost:${ENV.PORT}/metrics`,
          health: `http://localhost:${ENV.PORT}/health`,
        },
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async (err) => {
        if (err) {
          logger.error("Error during server shutdown", { error: err });
          process.exit(1);
        }

        try {
          // Close database connections
          await db.close();
          await redis.close();
          logger.info("Database connections closed successfully");
        } catch (dbError) {
          logger.error("Error closing database connections", { error: dbError });
        }

        logger.info("Server shut down successfully");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", { error });
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled rejection", { reason, promise });
      process.exit(1);
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app };
