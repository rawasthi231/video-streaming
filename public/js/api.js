/**
 * Centralized API Service for Video Streaming Application
 * Handles all HTTP requests to the backend API
 */

class ApiService {
  constructor() {
    this.baseURL = window.location.origin;
    this.apiPrefix = '/api/v1';
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Remove Content-Type for FormData requests
    if (options.body instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return response;
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  /**
   * Get list of videos with pagination
   */
  async getVideos(page = 1, limit = 20) {
    return this.request(`${this.apiPrefix}/videos?page=${page}&limit=${limit}`);
  }

  /**
   * Get single video by ID
   */
  async getVideoById(id) {
    return this.request(`${this.apiPrefix}/videos/${id}`);
  }

  /**
   * Upload a new video
   */
  async uploadVideo(formData, onProgress = null) {
    const url = `${this.baseURL}${this.apiPrefix}/videos/upload`;
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100);
            onProgress(percentage);
          }
        });
      }
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.error?.message || `Upload failed: ${xhr.status}`));
          } catch (error) {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        }
      });
      
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timeout'));
      });
      
      xhr.open('POST', url);
      xhr.timeout = 300000; // 5 minutes timeout
      xhr.send(formData);
    });
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    return this.request('/system');
  }

  /**
   * Health check
   */
  async healthCheck() {
    return this.request('/health');
  }

  /**
   * Get application metrics
   */
  async getMetrics() {
    return this.request('/metrics');
  }

  /**
   * Trigger CPU burn for load testing
   */
  async triggerBurn(milliseconds = 1000) {
    return this.request(`/burn?ms=${milliseconds}`);
  }
}

/**
 * Utility functions for the API service
 */
class ApiUtils {
  /**
   * Format file size in human-readable format
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration in HH:MM:SS format
   */
  static formatDuration(seconds) {
    if (!seconds || seconds === 0) return '00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format date in relative time
   */
  static formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Generate video thumbnail placeholder
   */
  static generateThumbnailPlaceholder(title, width = 300, height = 200) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a252f');
    gradient.addColorStop(1, '#2a3540');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Play icon
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 30, 0, 2 * Math.PI);
    ctx.fill();
    
    // Play triangle
    ctx.fillStyle = '#0f1419';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 8, height / 2 - 12);
    ctx.lineTo(width / 2 - 8, height / 2 + 12);
    ctx.lineTo(width / 2 + 10, height / 2);
    ctx.closePath();
    ctx.fill();
    
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.substring(0, 30), width / 2, height - 20);
    
    return canvas.toDataURL();
  }

  /**
   * Validate video file
   */
  static validateVideoFile(file) {
    const maxSize = 1024 * 1024 * 1024; // 1GB
    const allowedTypes = ['video/mp4', 'video/webm', 'video/mkv', 'video/avi', 'video/quicktime'];
    
    const errors = [];
    
    if (!file) {
      errors.push('No file selected');
      return { isValid: false, errors };
    }
    
    if (file.size > maxSize) {
      errors.push(`File size must be less than ${ApiUtils.formatFileSize(maxSize)}`);
    }
    
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type not supported. Allowed: ${allowedTypes.join(', ')}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Notification system
 */
class NotificationManager {
  static show(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="d-flex justify-between align-center">
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">&times;</button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto remove
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  static success(message, duration = 5000) {
    this.show(message, 'success', duration);
  }

  static error(message, duration = 7000) {
    this.show(message, 'error', duration);
  }

  static warning(message, duration = 6000) {
    this.show(message, 'warning', duration);
  }
}

/**
 * Router for client-side navigation
 */
class Router {
  constructor() {
    this.routes = new Map();
    this.currentPath = window.location.pathname;
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      this.handleRoute(window.location.pathname);
    });
  }

  /**
   * Register a route
   */
  register(path, handler) {
    this.routes.set(path, handler);
  }

  /**
   * Navigate to a path
   */
  navigate(path, pushState = true) {
    if (pushState && path !== this.currentPath) {
      window.history.pushState({}, '', path);
    }
    this.handleRoute(path);
  }

  /**
   * Handle route change
   */
  handleRoute(path) {
    this.currentPath = path;
    
    // Update active navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === path);
    });
    
    // Find and execute route handler
    const handler = this.routes.get(path);
    if (handler) {
      handler();
    } else {
      // Handle dynamic routes (e.g., /watch/:id)
      for (const [routePath, routeHandler] of this.routes) {
        if (routePath.includes(':')) {
          const regex = new RegExp('^' + routePath.replace(/:[^/]+/g, '([^/]+)') + '$');
          const match = path.match(regex);
          if (match) {
            routeHandler(...match.slice(1));
            return;
          }
        }
      }
      
      // Default 404 handler
      this.handle404();
    }
  }

  /**
   * Handle 404 errors
   */
  handle404() {
    document.getElementById('app').innerHTML = `
      <div class="main-content">
        <div class="container">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <h2>Page Not Found</h2>
            <p>The page you're looking for doesn't exist.</p>
            <a href="/" class="btn btn-primary" onclick="event.preventDefault(); router.navigate('/')">Go Home</a>
          </div>
        </div>
      </div>
    `;
  }
}

// Global instances
const api = new ApiService();
const router = new Router();

// Export for use in other scripts
window.api = api;
window.router = router;
window.ApiUtils = ApiUtils;
window.NotificationManager = NotificationManager;
