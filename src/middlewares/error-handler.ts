import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger.js";
import { ApiResponse } from "../types/index.js";

// Custom error class for application errors
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Maintain proper stack trace for where our error was thrown (Node.js only)
    Error.captureStackTrace(this, AppError);
  }
}

// Centralized error handler middleware
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "Internal server error";

  // Handle known application errors
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  }

  // Handle validation errors (Zod)
  if (error.name === "ZodError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid request data";
  }

  // Handle multer errors (file upload)
  if (error.name === "MulterError") {
    statusCode = 400;
    code = "FILE_UPLOAD_ERROR";
    message = error.message;
  }

  // Handle FFmpeg errors
  if (error.message?.includes("ffmpeg")) {
    statusCode = 500;
    code = "VIDEO_PROCESSING_ERROR";
    message = "Video processing failed";
  }

  // Log error details
  logger.error("Request error", {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code,
      statusCode,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    },
  });

  // Prepare error response
  const errorResponse: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === "development" && { details: error.stack }),
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.get("X-Request-ID"),
    },
  };

  res.status(statusCode).json(errorResponse);
}

// 404 handler
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ApiResponse = {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  res.status(404).json(errorResponse);
}

// Async error handler wrapper
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void | U>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
