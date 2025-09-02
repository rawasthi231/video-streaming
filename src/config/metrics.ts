import promClient from 'prom-client';
// import { ENV } from './env.js';

// Create a Registry to register the metrics
export const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'video-autoscale-demo',
  version: process.env.npm_package_version || '1.0.0',
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics for video streaming
export const metrics = {
  // HTTP request metrics
  httpRequestsTotal: new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  }),

  httpRequestDuration: new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    registers: [register],
  }),

  // Video streaming metrics
  videoBytesStreamed: new promClient.Counter({
    name: 'video_bytes_streamed_total',
    help: 'Total bytes streamed for video content',
    labelNames: ['video_id', 'quality'],
    registers: [register],
  }),

  activeStreams: new promClient.Gauge({
    name: 'active_video_streams',
    help: 'Number of active video streams',
    labelNames: ['video_id'],
    registers: [register],
  }),

  videoProcessingJobs: new promClient.Gauge({
    name: 'video_processing_jobs',
    help: 'Number of video processing jobs by status',
    labelNames: ['status'],
    registers: [register],
  }),

  // CPU burn metrics (for load testing)
  cpuBurnRequests: new promClient.Counter({
    name: 'cpu_burn_requests_total',
    help: 'Total number of CPU burn requests',
    labelNames: ['duration_ms'],
    registers: [register],
  }),

  // Custom business metrics
  concurrentViewers: new promClient.Gauge({
    name: 'concurrent_viewers',
    help: 'Number of concurrent video viewers',
    registers: [register],
  }),

  videoUploadDuration: new promClient.Histogram({
    name: 'video_upload_duration_seconds',
    help: 'Time taken to upload and process videos',
    labelNames: ['video_format', 'resolution'],
    buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
    registers: [register],
  }),
};

// Middleware to track HTTP metrics
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      
      metrics.httpRequestsTotal.inc({
        method: req.method,
        route,
        status_code: res.statusCode,
      });
      
      metrics.httpRequestDuration.observe(
        {
          method: req.method,
          route,
          status_code: res.statusCode,
        },
        duration
      );
    });
    
    next();
  };
}

// Export registry for /metrics endpoint
export { register as metricsRegistry };
