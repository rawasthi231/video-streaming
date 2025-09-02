import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";

import { ENV, CONSTANTS } from "./config/env.js";
import { logger } from "./config/logger.js";
import { metricsMiddleware } from "./config/metrics.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { concurrentUserMiddleware } from "./middlewares/concurrent-users.js";
import { videoRoutes } from "./routes/video-routes.js";
import { utilityRoutes } from "./routes/utility-routes.js";

// Create Express application
const app = express();

// Ensure required directories exist
async function ensureDirectories(): Promise<void> {
  const dirs = ["uploads", "logs", ENV.VIDEO_STORAGE_PATH, ENV.HLS_OUTPUT_PATH];

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

// Static file serving for HLS content and video directories
app.use(
  "/video",
  express.static(path.join(process.cwd(), "hls"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".ts") || filePath.endsWith(".m4s")) {
        res.setHeader("Cache-Control", "public, max-age=3600, immutable");
        res.setHeader("Access-Control-Allow-Origin", "*");
      } else if (filePath.endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "public, max-age=5");
        res.setHeader("Access-Control-Allow-Origin", "*");
      } else if (filePath.endsWith(".jpg") || filePath.endsWith(".png")) {
        res.setHeader("Content-Type", filePath.endsWith(".jpg") ? "image/jpeg" : "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
    },
  })
);

// Static files for frontend assets
app.use("/css", express.static("public/css"));
app.use("/js", express.static("public/js"));
app.use("/images", express.static("public/images"));
app.use("/fonts", express.static("public/fonts"));
app.use("/static", express.static("src/static"));

// Service worker
app.get("/sw.js", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "sw.js"));
});

// API routes
app.use(CONSTANTS.API_PREFIX + "/videos", videoRoutes);

// Utility routes (health, metrics, etc.)
app.use("/", utilityRoutes);

// Serve frontend for SPA routes
const frontendRoutes = ["/", "/videos", "/upload", "/watch/*"];

// Handle SPA routing - serve index.html for frontend routes
app.get(frontendRoutes, (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Legacy demo page (for API testing)
app.get("/api-demo", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Autoscale Demo - API Testing</title>
    <link rel="icon" href="/static/favicon.ico" />
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #0f1419; color: #fff; }
        .video-container { margin: 20px 0; }
        .api-links { background: #1a252f; padding: 15px; border-radius: 8px; border: 1px solid #2a3540; }
        .api-links a { display: block; margin: 5px 0; color: #00d4ff; text-decoration: none; }
        .api-links a:hover { color: #007acc; }
        code { background: #2a3540; padding: 4px 8px; border-radius: 4px; color: #00d4ff; }
        h1, h2, h3 { color: #00d4ff; }
    </style>
</head>
<body>
    <h1>🎥 Video Autoscale Demo - API Testing</h1>
    <p>This page provides direct API access for testing. Use the <a href="/" style="color: #00d4ff;">main application</a> for the full user interface.</p>
    
    <div class="video-container">
        <h2>📺 Demo Video Player</h2>
        <video id="player" controls autoplay width="640" height="360" src="/video/master.m3u8">
            Your browser does not support the video tag.
        </video>
        <p><small>Open DevTools → Network to watch HLS segment requests.</small></p>
    </div>

    <div class="api-links">
        <h3>🔗 API Endpoints</h3>
        <a href="/docs" target="_blank">📖 API Documentation (Swagger)</a>
        <a href="/metrics" target="_blank">📊 Prometheus Metrics</a>
        <a href="/system" target="_blank">⚙️ System Information</a>
        <a href="${CONSTANTS.API_PREFIX}/videos" target="_blank">🎬 Videos List</a>
        <a href="/health" target="_blank">❤️ Health Check</a>
        <a href="/ready" target="_blank">✅ Readiness Check</a>
    </div>

    <div class="api-links">
        <h3>🔥 Load Testing</h3>
        <p>Use these endpoints to trigger autoscaling:</p>
        <code>curl "http://localhost:${ENV.PORT}/burn?ms=500"</code><br>
        <code>curl "http://localhost:${ENV.PORT}/burn?ms=1000"</code><br>
        <code>curl "http://localhost:${ENV.PORT}/burn?ms=2000"</code>
        
        <h4>🚀 Stress Test Commands</h4>
        <code>
        # Simulate traffic spike (run multiple terminals)<br>
        for i in {1..50}; do curl "http://localhost:${ENV.PORT}/burn?ms=1000" & done<br><br>
        # Watch HPA scaling<br>
        watch kubectl get hpa
        </code>
    </div>

    <script>
        // Simple viewer count simulation
        let viewerCount = Math.floor(Math.random() * 1000) + 100;
        
        function updateViewerCount() {
            viewerCount += Math.floor(Math.random() * 20) - 10;
            viewerCount = Math.max(50, viewerCount);
            document.title = \`📺 API Demo (👥 \${viewerCount} viewers)\`;
        }
        
        setInterval(updateViewerCount, 3000);
        updateViewerCount();
    </script>
</body>
</html>
  `);
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer(): Promise<void> {
  try {
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
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close((err) => {
        if (err) {
          logger.error("Error during server shutdown", { error: err });
          process.exit(1);
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
