#!/usr/bin/env node

/**
 * Video Streaming Platform Load Tester
 * Simulates millions of users with realistic traffic patterns for HPA testing
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
// import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
// import cluster from 'cluster';
import os from 'os';
import fs from 'fs';
// import path from 'path';

// Configuration
const CONFIG = {
  TARGET_URL: process.env.TARGET_URL || 'http://localhost:8080',
  TOTAL_USERS: parseInt(process.env.TOTAL_USERS) || 1000000, // 1 million users
  DURATION_MINUTES: parseInt(process.env.DURATION_MINUTES) || 30,
  RAMP_UP_MINUTES: parseInt(process.env.RAMP_UP_MINUTES) || 5,
  WORKERS: parseInt(process.env.WORKERS) || os.cpus().length,
  SCENARIOS: {
    browser: { weight: 40, name: 'Video Browser' },
    viewer: { weight: 35, name: 'Video Viewer' },
    uploader: { weight: 5, name: 'Video Uploader' },
    api_user: { weight: 15, name: 'API User' },
    burst_viewer: { weight: 5, name: 'Burst Viewer' }
  },
  METRICS: {
    COLLECTION_INTERVAL: 5000, // 5 seconds
    OUTPUT_FILE: 'load-test-results.json'
  }
};

// Global metrics collection
class MetricsCollector {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimeSum: 0,
      responseTimeCount: 0,
      errorsByType: {},
      requestsByEndpoint: {},
      concurrentUsers: 0,
      throughputHistory: [],
      responseTimeHistory: [],
      errorRateHistory: []
    };
    
    this.intervalId = null;
    this.startCollection();
  }

  recordRequest(endpoint, responseTime, success, errorType = null) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (errorType) {
        this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
      }
    }
    
    this.metrics.responseTimeSum += responseTime;
    this.metrics.responseTimeCount++;
    
    if (!this.metrics.requestsByEndpoint[endpoint]) {
      this.metrics.requestsByEndpoint[endpoint] = { count: 0, totalTime: 0 };
    }
    this.metrics.requestsByEndpoint[endpoint].count++;
    this.metrics.requestsByEndpoint[endpoint].totalTime += responseTime;
  }

  updateConcurrentUsers(count) {
    this.metrics.concurrentUsers = count;
  }

  startCollection() {
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedMinutes = (now - this.metrics.startTime) / 60000;
      
      // Calculate current throughput (requests per second)
      const currentThroughput = this.metrics.totalRequests / (elapsedMinutes * 60);
      this.metrics.throughputHistory.push({
        timestamp: now,
        value: currentThroughput
      });
      
      // Calculate average response time
      const avgResponseTime = this.metrics.responseTimeCount > 0 
        ? this.metrics.responseTimeSum / this.metrics.responseTimeCount 
        : 0;
      this.metrics.responseTimeHistory.push({
        timestamp: now,
        value: avgResponseTime
      });
      
      // Calculate error rate
      const errorRate = this.metrics.totalRequests > 0 
        ? (this.metrics.failedRequests / this.metrics.totalRequests) * 100 
        : 0;
      this.metrics.errorRateHistory.push({
        timestamp: now,
        value: errorRate
      });
      
      // Keep only last 100 history points
      if (this.metrics.throughputHistory.length > 100) {
        this.metrics.throughputHistory.shift();
        this.metrics.responseTimeHistory.shift();
        this.metrics.errorRateHistory.shift();
      }
      
      // Print current stats
      this.printStats();
      
    }, CONFIG.METRICS.COLLECTION_INTERVAL);
  }

  printStats() {
    const elapsedMinutes = (Date.now() - this.metrics.startTime) / 60000;
    const throughput = this.metrics.totalRequests / (elapsedMinutes * 60);
    const avgResponseTime = this.metrics.responseTimeCount > 0 
      ? Math.round(this.metrics.responseTimeSum / this.metrics.responseTimeCount) 
      : 0;
    const errorRate = this.metrics.totalRequests > 0 
      ? ((this.metrics.failedRequests / this.metrics.totalRequests) * 100).toFixed(2) 
      : 0;

    console.clear();
    console.log('🚀 VIDEO STREAMING LOAD TEST - REAL-TIME METRICS');
    console.log('=' .repeat(60));
    console.log(`⏱️  Elapsed Time: ${elapsedMinutes.toFixed(1)} minutes`);
    console.log(`👥 Concurrent Users: ${this.metrics.concurrentUsers.toLocaleString()}`);
    console.log(`📊 Total Requests: ${this.metrics.totalRequests.toLocaleString()}`);
    console.log(`✅ Success Rate: ${((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(1)}%`);
    console.log(`❌ Error Rate: ${errorRate}%`);
    console.log(`⚡ Throughput: ${throughput.toFixed(1)} req/sec`);
    console.log(`⏲️  Avg Response Time: ${avgResponseTime}ms`);
    console.log('');
    
    // Show top endpoints
    console.log('🎯 TOP ENDPOINTS:');
    const sortedEndpoints = Object.entries(this.metrics.requestsByEndpoint)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    
    sortedEndpoints.forEach(([endpoint, stats]) => {
      const avgTime = Math.round(stats.totalTime / stats.count);
      console.log(`   ${endpoint}: ${stats.count.toLocaleString()} requests (${avgTime}ms avg)`);
    });
    
    // Show error breakdown if any
    if (Object.keys(this.metrics.errorsByType).length > 0) {
      console.log('');
      console.log('🚨 ERROR BREAKDOWN:');
      Object.entries(this.metrics.errorsByType).forEach(([type, count]) => {
        console.log(`   ${type}: ${count.toLocaleString()}`);
      });
    }
  }

  saveResults() {
    const results = {
      ...this.metrics,
      summary: {
        duration: (Date.now() - this.metrics.startTime) / 1000,
        totalRequests: this.metrics.totalRequests,
        avgThroughput: this.metrics.totalRequests / ((Date.now() - this.metrics.startTime) / 1000),
        avgResponseTime: this.metrics.responseTimeCount > 0 
          ? this.metrics.responseTimeSum / this.metrics.responseTimeCount 
          : 0,
        successRate: (this.metrics.successfulRequests / this.metrics.totalRequests) * 100,
        errorRate: (this.metrics.failedRequests / this.metrics.totalRequests) * 100
      }
    };
    
    fs.writeFileSync(CONFIG.METRICS.OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${CONFIG.METRICS.OUTPUT_FILE}`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.saveResults();
  }
}

// HTTP request helper
class HttpClient {
  static async makeRequest(url, options = {}) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'LoadTester/1.0',
          'Accept': 'application/json, text/html',
          'Connection': 'keep-alive',
          ...options.headers
        },
        timeout: 30000
      };

      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          resolve({
            success: res.statusCode < 400,
            statusCode: res.statusCode,
            responseTime,
            data,
            error: null
          });
        });
      });

      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          statusCode: 0,
          responseTime,
          data: null,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const responseTime = Date.now() - startTime;
        resolve({
          success: false,
          statusCode: 0,
          responseTime,
          data: null,
          error: 'timeout'
        });
      });

      if (options.data) {
        req.write(options.data);
      }
      
      req.end();
    });
  }
}

// User scenarios
class UserScenarios {
  constructor(baseUrl, metricsCollector) {
    this.baseUrl = baseUrl;
    this.metrics = metricsCollector;
  }

  // Video Browser - browses video lists and searches
  async videoBrowser() {
    const scenarios = [
      () => this.makeRequest('/'),
      () => this.makeRequest('/videos'),
      () => this.makeRequest('/api/v1/videos?page=1&limit=20'),
      () => this.makeRequest('/api/v1/videos?page=2&limit=20'),
      () => this.wait(2000), // User reading time
      () => this.makeRequest('/api/v1/videos?page=3&limit=20'),
    ];

    return this.executeScenario(scenarios, 'browser');
  }

  // Video Viewer - watches videos (simulates HLS streaming)
  async videoViewer() {
    // First get list of videos
    const videosResponse = await this.makeRequest('/api/v1/videos');
    
    if (videosResponse.success && videosResponse.data) {
      try {
        const videos = JSON.parse(videosResponse.data);
        if (videos.data && videos.data.length > 0) {
          const randomVideo = videos.data[Math.floor(Math.random() * videos.data.length)];
          
          const scenarios = [
            () => this.makeRequest(`/watch/${randomVideo.id}`),
            () => this.makeRequest(`/api/v1/videos/${randomVideo.id}`),
            () => this.makeRequest(`/video/${randomVideo.id}/master.m3u8`),
            () => this.wait(5000), // Simulate watching
            () => this.simulateHLSStreaming(randomVideo.id),
          ];

          return this.executeScenario(scenarios, 'viewer');
        }
      } catch (e) {
        // Fallback if parsing fails
      }
    }
    
    // Fallback scenario
    return this.executeScenario([
      () => this.makeRequest('/videos'),
      () => this.wait(3000)
    ], 'viewer');
  }

  // Video Uploader - uploads videos (simulated)
  async videoUploader() {
    const scenarios = [
      () => this.makeRequest('/upload'),
      () => this.wait(2000), // Form filling time
      () => this.makeRequest('/api/v1/videos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        data: 'simulated-video-data'
      }),
      () => this.wait(10000), // Upload processing time
    ];

    return this.executeScenario(scenarios, 'uploader');
  }

  // API User - makes various API calls
  async apiUser() {
    const scenarios = [
      () => this.makeRequest('/api/v1/videos'),
      () => this.makeRequest('/health'),
      () => this.makeRequest('/metrics'),
      () => this.makeRequest('/system'),
      () => this.wait(1000),
      () => this.makeRequest('/api/v1/videos?limit=50'),
    ];

    return this.executeScenario(scenarios, 'api_user');
  }

  // Burst Viewer - intensive video streaming
  async burstViewer() {
    const scenarios = [];
    
    // Create multiple concurrent HLS requests
    for (let i = 0; i < 10; i++) {
      scenarios.push(() => this.makeRequest(`/video/master.m3u8?t=${Date.now()}`));
      scenarios.push(() => this.makeRequest('/burn?ms=500')); // CPU intensive
    }

    return this.executeScenario(scenarios, 'burst');
  }

  // Simulate HLS streaming with segment requests
  async simulateHLSStreaming(videoId) {
    const segments = ['segment_000.ts', 'segment_001.ts', 'segment_002.ts'];
    const promises = segments.map(segment => 
      this.makeRequest(`/video/${videoId}/${segment}`)
    );
    
    await Promise.all(promises);
  }

  // Execute a scenario with error handling
  async executeScenario(scenarios, scenarioType) {
    try {
      for (const scenario of scenarios) {
        await scenario();
        await this.wait(100 + Math.random() * 500); // Random delay between requests
      }
      return true;
    } catch (error) {
      this.metrics.recordRequest(`scenario_${scenarioType}`, 0, false, error.message);
      return false;
    }
  }

  // Make HTTP request and record metrics
  async makeRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : this.baseUrl + endpoint;
    const response = await HttpClient.makeRequest(url, options);
    
    this.metrics.recordRequest(
      endpoint,
      response.responseTime,
      response.success,
      response.error
    );

    return response;
  }

  // Wait helper
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Load test worker
class LoadTestWorker {
  constructor(workerId, totalUsers, durationMs, rampUpMs) {
    this.workerId = workerId;
    this.totalUsers = totalUsers;
    this.durationMs = durationMs;
    this.rampUpMs = rampUpMs;
    this.scenarios = new UserScenarios(CONFIG.TARGET_URL, globalMetrics);
    this.activeUsers = 0;
    this.isRunning = false;
  }

  async start() {
    console.log(`🚀 Worker ${this.workerId} starting load test...`);
    console.log(`👥 Target users: ${this.totalUsers.toLocaleString()}`);
    console.log(`⏱️  Duration: ${this.durationMs / 60000} minutes`);
    console.log(`📈 Ramp-up: ${this.rampUpMs / 60000} minutes`);
    
    this.isRunning = true;
    const startTime = Date.now();
    const endTime = startTime + this.durationMs;

    // Ramp-up phase: gradually add users
    const rampUpInterval = this.rampUpMs / this.totalUsers;
    
    for (let i = 0; i < this.totalUsers && this.isRunning; i++) {
      if (Date.now() >= endTime) break;
      
      // Start user
      this.startUser(i);
      this.activeUsers++;
      globalMetrics.updateConcurrentUsers(this.activeUsers);
      
      // Wait for ramp-up interval
      if (i < this.totalUsers - 1) {
        await this.wait(rampUpInterval);
      }
    }

    // Wait for test completion
    while (Date.now() < endTime && this.isRunning) {
      await this.wait(1000);
    }

    this.isRunning = false;
    console.log(`\n✅ Worker ${this.workerId} completed load test`);
  }

  startUser(userId) {
    // Select scenario based on weights
    const scenarioType = this.selectScenario();
    
    const runUserScenario = async () => {
      while (this.isRunning) {
        try {
          switch (scenarioType) {
            case 'browser':
              await this.scenarios.videoBrowser();
              break;
            case 'viewer':
              await this.scenarios.videoViewer();
              break;
            case 'uploader':
              await this.scenarios.videoUploader();
              break;
            case 'api_user':
              await this.scenarios.apiUser();
              break;
            case 'burst_viewer':
              await this.scenarios.burstViewer();
              break;
          }
          
          // Random wait between scenario iterations
          await this.wait(1000 + Math.random() * 5000);
          
        } catch (error) {
          console.error(`User ${userId} error:`, error.message);
          await this.wait(5000); // Wait before retrying
        }
      }
      
      this.activeUsers--;
      globalMetrics.updateConcurrentUsers(this.activeUsers);
    };

    // Start user scenario (fire and forget)
    runUserScenario().catch(console.error);
  }

  selectScenario() {
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const [scenario, config] of Object.entries(CONFIG.SCENARIOS)) {
      cumulative += config.weight;
      if (random <= cumulative) {
        return scenario;
      }
    }
    
    return 'browser'; // fallback
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main load tester
class LoadTester {
  static async run() {
    console.log('🎬 VIDEO STREAMING PLATFORM LOAD TESTER');
    console.log('=====================================');
    console.log(`🎯 Target: ${CONFIG.TARGET_URL}`);
    console.log(`👥 Users: ${CONFIG.TOTAL_USERS.toLocaleString()}`);
    console.log(`⏱️  Duration: ${CONFIG.DURATION_MINUTES} minutes`);
    console.log(`📈 Ramp-up: ${CONFIG.RAMP_UP_MINUTES} minutes`);
    console.log(`⚡ Workers: ${CONFIG.WORKERS}`);
    console.log('');

    // Initialize metrics collector
    global.globalMetrics = new MetricsCollector();

    // Calculate users per worker
    const usersPerWorker = Math.ceil(CONFIG.TOTAL_USERS / CONFIG.WORKERS);
    const durationMs = CONFIG.DURATION_MINUTES * 60 * 1000;
    const rampUpMs = CONFIG.RAMP_UP_MINUTES * 60 * 1000;

    // Start workers
    const workers = [];
    for (let i = 0; i < CONFIG.WORKERS; i++) {
      const worker = new LoadTestWorker(i, usersPerWorker, durationMs, rampUpMs);
      workers.push(worker.start());
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping load test...');
      global.globalMetrics.stop();
      process.exit(0);
    });

    // Wait for all workers to complete
    await Promise.all(workers);
    
    console.log('\n🎉 Load test completed successfully!');
    global.globalMetrics.stop();
  }
}

// Global metrics instance
let globalMetrics;

// Run load test if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  LoadTester.run().catch(console.error);
}

export { LoadTester, UserScenarios, MetricsCollector };
