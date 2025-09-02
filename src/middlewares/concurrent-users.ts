import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

interface UserSession {
  id: string;
  ip: string;
  userAgent: string;
  startTime: Date;
  lastActivity: Date;
  requestCount: number;
}

class ConcurrentUserTracker {
  private activeSessions: Map<string, UserSession> = new Map();
  private sessionTimeout = 30 * 1000; // 30 seconds timeout
  private cleanupInterval = 10 * 1000; // Cleanup every 10 seconds
  private totalSessions = 0;
  private peakConcurrentUsers = 0;

  constructor() {
    // Start cleanup interval
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

  private generateSessionId(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const requestId = req.headers['x-request-id'] as string;
    
    // Use a combination of IP, user agent, and request ID for session identification
    // In a real application, you'd use proper session management
    return `${ip}-${Buffer.from(userAgent).toString('base64').slice(0, 10)}-${requestId?.slice(-8) || Date.now()}`;
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceLastActivity > this.sessionTimeout) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired user sessions`);
    }
  }

  public trackRequest(req: Request): void {
    const sessionId = this.generateSessionId(req);
    const now = new Date();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    if (this.activeSessions.has(sessionId)) {
      // Update existing session
      const session = this.activeSessions.get(sessionId)!;
      session.lastActivity = now;
      session.requestCount++;
    } else {
      // Create new session
      const newSession: UserSession = {
        id: sessionId,
        ip,
        userAgent,
        startTime: now,
        lastActivity: now,
        requestCount: 1
      };
      
      this.activeSessions.set(sessionId, newSession);
      this.totalSessions++;
      
      // Update peak if necessary
      const currentConcurrent = this.activeSessions.size;
      if (currentConcurrent > this.peakConcurrentUsers) {
        this.peakConcurrentUsers = currentConcurrent;
      }
    }
  }

  public getCurrentStats() {
    const activeSessions = Array.from(this.activeSessions.values());
    const now = new Date();
    
    // Group sessions by user agent pattern (e.g., Artillery, browser, etc.)
    const userAgentGroups: Record<string, number> = {};
    const ipGroups: Record<string, number> = {};
    
    let totalRequests = 0;
    
    activeSessions.forEach(session => {
      totalRequests += session.requestCount;
      
      // Categorize user agents
      let category = 'Unknown';
      if (session.userAgent.includes('Artillery')) {
        category = 'Artillery Load Tester';
      } else if (session.userAgent.includes('Chrome')) {
        category = 'Chrome Browser';
      } else if (session.userAgent.includes('Firefox')) {
        category = 'Firefox Browser';
      } else if (session.userAgent.includes('Safari')) {
        category = 'Safari Browser';
      } else if (session.userAgent.includes('curl')) {
        category = 'curl/API Client';
      }
      
      userAgentGroups[category] = (userAgentGroups[category] || 0) + 1;
      ipGroups[session.ip] = (ipGroups[session.ip] || 0) + 1;
    });

    return {
      concurrent: {
        current: this.activeSessions.size,
        peak: this.peakConcurrentUsers,
        total_sessions: this.totalSessions
      },
      activity: {
        total_requests: totalRequests,
        avg_requests_per_user: activeSessions.length > 0 
          ? Math.round(totalRequests / activeSessions.length * 100) / 100 
          : 0
      },
      breakdown: {
        by_user_agent: userAgentGroups,
        by_ip_count: Object.keys(ipGroups).length,
        unique_ips: Math.min(Object.keys(ipGroups).length, 10) // Show top 10 IPs only
      },
      sessions: activeSessions.map(session => ({
        id: session.id.slice(-8), // Show last 8 chars for privacy
        ip: session.ip,
        duration_seconds: Math.round((now.getTime() - session.startTime.getTime()) / 1000),
        requests: session.requestCount,
        last_activity_seconds_ago: Math.round((now.getTime() - session.lastActivity.getTime()) / 1000)
      }))
    };
  }

  public resetStats(): void {
    this.peakConcurrentUsers = this.activeSessions.size;
    this.totalSessions = this.activeSessions.size;
  }
}

// Global instance
export const userTracker = new ConcurrentUserTracker();

// Middleware function
export function concurrentUserMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip tracking for static assets and health checks
    const path = req.path.toLowerCase();
    const skipPaths = ['/health', '/ready', '/metrics', '/favicon.ico'];
    const skipExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg'];
    
    const shouldSkip = skipPaths.includes(path) || 
                      skipExtensions.some(ext => path.endsWith(ext));
    
    if (!shouldSkip) {
      userTracker.trackRequest(req);
    }
    
    next();
  };
}
