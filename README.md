# 🎥 Video streaming Demo

A production-ready video streaming service built with Express.js and TypeScript that demonstrates Kubernetes Horizontal Pod Autoscaler (HPA) capabilities. The application converts uploaded videos to HLS format for adaptive streaming and includes comprehensive monitoring and load testing features.

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Project Structure](#-project-structure)
- [Setup Instructions](#-setup-instructions)
- [Running the Application](#-running-the-application)
- [Kubernetes Deployment](#-kubernetes-deployment)
- [API Documentation](#-api-documentation)
- [Load Testing & Autoscaling](#-load-testing--autoscaling)
- [Monitoring](#-monitoring)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## ✨ Features

- **🎬 Modern UI**: Hotstar-inspired dark theme with responsive design
- **📱 Single Page App**: Client-side routing with smooth navigation
- **🎥 Video Streaming**: Upload and stream videos in HLS format with adaptive quality
- **📤 Drag & Drop Upload**: Modern upload interface with progress tracking
- **🔍 Search & Filter**: Real-time video search and category filtering
- **⚡ Auto-scaling**: Kubernetes HPA based on CPU and memory metrics
- **🔒 Security**: Rate limiting, CORS, Helmet security headers
- **📊 Monitoring**: Prometheus metrics and health checks
- **🔥 Load Testing**: Built-in endpoints for testing autoscaling
- **📚 API Documentation**: Swagger/OpenAPI documentation
- **🚀 Production Ready**: Multi-stage Docker build with security best practices

## 🔧 Prerequisites

Ensure you have the following installed on your system:

### Required Software

- **Node.js**: Version 22.x or higher
- **Docker Desktop**: Latest version with Kubernetes enabled
- **FFmpeg**: For video processing (included in Docker image)
- **kubectl**: Kubernetes CLI tool

### System Requirements

- **Memory**: Minimum 4GB RAM (8GB+ recommended for Kubernetes)
- **Storage**: At least 2GB free space for videos and containers
- **CPU**: Multi-core processor recommended for video processing

### Docker Desktop Configuration

1. **Enable Kubernetes**:
   - Open Docker Desktop → Settings → Kubernetes
   - Check "Enable Kubernetes"
   - Click "Apply & Restart"

2. **Resource Allocation**:
   - Memory: 4GB minimum (6GB+ recommended)
   - CPU: 2+ cores
   - Disk: 60GB+

3. **Verify Installation**:
   ```bash
   kubectl cluster-info
   kubectl get nodes
   ```

## 📁 Project Structure

```
video-streaming/
├── src/                    # Source code
│   ├── config/            # Configuration modules
│   ├── controllers/       # Route controllers
│   ├── middlewares/       # Express middlewares
│   ├── routes/           # API routes
│   └── server.ts         # Application entry point
├── k8s/                   # Kubernetes manifests
│   ├── deployment.yaml   # Application deployment
│   ├── service.yaml      # Load balancer service
│   └── hpa.yaml          # Horizontal Pod Autoscaler
├── scripts/              # Utility scripts
├── hls/                  # HLS video segments
├── uploads/              # Temporary upload storage
├── videos/               # Processed videos
├── logs/                 # Application logs
├── Dockerfile            # Multi-stage container build
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
└── .env                  # Environment variables
```

## 🚀 Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Clone the repository
cd /path/to/your/workspace
git clone <repository-url>
cd video-streaming

# Install dependencies
npm install
```

### 2. Environment Configuration

Copy and configure environment variables:

```bash
# Environment is already configured in .env
# Review and modify settings if needed
cat .env
```

**Key Environment Variables:**

```bash
NODE_ENV=development
PORT=8080
VIDEO_STORAGE_PATH=./videos
HLS_OUTPUT_PATH=./hls
MAX_FILE_SIZE=1073741824
SUPPORTED_FORMATS=mp4,webm,mkv,avi,mov
CORS_ORIGINS=http://localhost:3000,http://localhost:8080,http://localhost:30080
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BURN_DEFAULT_MS=200
BURN_MAX_MS=5000
LOG_LEVEL=info
METRICS_PORT=9090
```

### 3. Generate Demo HLS Content

```bash
# Create demo HLS video for testing
./scripts/generate-hls.sh
```

### 4. Build the Application

```bash
# TypeScript compilation
npm run build

# Verify build output
ls -la dist/
```

## 🏃 Running the Application

### Development Mode

```bash
# Start with hot reload
npm run dev

# Application will be available at:
# - Main app: http://localhost:8080
# - API docs: http://localhost:8080/docs
# - Metrics: http://localhost:8080/metrics
```

### Production Mode

```bash
# Build and start
npm run build
npm start
```

### Docker Build and Run

```bash
# Build Docker image
docker build -t video-streaming:latest .

# Run container locally
docker run -p 8080:8080 \
  --name video-streaming-app \
  -e NODE_ENV=production \
  video-streaming:latest

# Test the application
curl http://localhost:8080/health
```

## ☸️ Kubernetes Deployment

### Prerequisites Check

Verify your Kubernetes environment:

```bash
# Check cluster status
kubectl cluster-info

# Verify nodes are ready
kubectl get nodes

# Check if metrics server is installed (required for HPA)
kubectl get deployment metrics-server -n kube-system
```

### Install Metrics Server (if not present)

```bash
# Install metrics server for HPA
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# For Docker Desktop, patch metrics server to work with self-signed certificates
kubectl patch deployment metrics-server -n kube-system --type='merge' -p='{"spec":{"template":{"spec":{"containers":[{"name":"metrics-server","args":["--cert-dir=/tmp","--secure-port=4443","--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname","--kubelet-use-node-status-port","--metric-resolution=15s","--kubelet-insecure-tls"]}]}}}}'

# Wait for metrics server to be ready
kubectl wait --for=condition=ready pod -l k8s-app=metrics-server -n kube-system --timeout=60s
```

### Build and Load Docker Image

```bash
# Build the Docker image
docker build -t video-streaming:latest .

# For Docker Desktop Kubernetes, the image is automatically available
# Verify image exists
docker images | grep video-streaming
```

### Deploy to Kubernetes

```bash
# Deploy all Kubernetes resources
kubectl apply -f k8s/

# Or deploy individually
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# Verify deployment
kubectl get pods -l app=video-streaming-app
kubectl get svc video-streaming-service
kubectl get hpa video-streaming-hpa
```

### Check Deployment Status

```bash
# Monitor deployment rollout
kubectl rollout status deployment/video-streaming-app

# Check pod logs
kubectl logs -l app=video-streaming-app -f

# Describe pod for troubleshooting
kubectl describe pod -l app=video-streaming-app
```

### Access the Application

```bash
# Get service external IP (LoadBalancer)
kubectl get svc video-streaming-service

# For Docker Desktop, access via localhost
# The service will be available at: http://localhost:80

# Or use port-forward for direct access
kubectl port-forward svc/video-streaming-service 8080:80
```

### Verify HPA Configuration

```bash
# Check HPA status
kubectl get hpa video-streaming-hpa

# Monitor HPA in real-time
kubectl get hpa video-streaming-hpa --watch

# Detailed HPA information
kubectl describe hpa video-streaming-hpa
```

## 📚 API Documentation

### Available Endpoints

| Endpoint | Method | Description |
|----------|--------|--------------|
| `/` | GET | Demo landing page with video player |
| `/docs` | GET | Swagger API documentation |
| `/health` | GET | Health check endpoint |
| `/ready` | GET | Readiness probe endpoint |
| `/metrics` | GET | Prometheus metrics |
| `/system` | GET | System information |
| `/api/v1/videos` | GET | List available videos |
| `/api/v1/videos/upload` | POST | Upload video for processing |
| `/burn` | GET | CPU load testing endpoint |
| `/video/*` | GET | HLS video segments |

### Example API Usage

```bash
# Health check
curl http://localhost:8080/health

# Get system info
curl http://localhost:8080/system

# List videos
curl http://localhost:8080/api/v1/videos

# Upload video
curl -X POST -F "video=@sample.mp4" http://localhost:8080/api/v1/videos/upload

# Load testing
curl "http://localhost:8080/burn?ms=1000"
```

## 🔥 Load Testing & Autoscaling

### Manual Load Testing

```bash
# Single request with CPU burn
curl "http://localhost:8080/burn?ms=500"

# Simulate traffic spike (run in multiple terminals)
for i in {1..50}; do 
  curl "http://localhost:8080/burn?ms=1000" &
done

# Wait for requests to complete
wait
```

### Automated Load Testing Script

```bash
# Create a load test script
cat > load-test.sh << 'EOF'
#!/bin/bash
echo "Starting load test..."
for round in {1..5}; do
  echo "Round $round: Sending 20 concurrent requests"
  for i in {1..20}; do
    curl -s "http://localhost:8080/burn?ms=800" > /dev/null &
  done
  wait
  echo "Round $round completed. Waiting 30 seconds..."
  sleep 30
done
echo "Load test completed!"
EOF

chmod +x load-test.sh
./load-test.sh
```

### Monitor Autoscaling

```bash
# Watch HPA scaling decisions
kubectl get hpa video-streaming-hpa --watch

# Monitor pod scaling
watch kubectl get pods -l app=video-streaming-app

# Check resource usage
kubectl top pods -l app=video-streaming-app
kubectl top nodes
```

## 📊 Monitoring

### Application Metrics

The application exposes Prometheus metrics at `/metrics`:

- HTTP request duration and count
- Active connections
- Video processing metrics
- Custom business metrics

### Health Checks

- **Liveness Probe**: `/health` - Application health status
- **Readiness Probe**: `/ready` - Service readiness for traffic

### Logs

```bash
# View application logs
kubectl logs -l app=video-streaming-app -f

# View logs from specific pod
kubectl logs <pod-name> -f

# View previous container logs
kubectl logs <pod-name> --previous
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Metrics Server Not Available

```bash
# Check if metrics server is running
kubectl get pods -n kube-system | grep metrics-server

# If not present, install it
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

#### 2. HPA Not Scaling

```bash
# Check HPA events
kubectl describe hpa video-streaming-hpa

# Verify metrics are available
kubectl top pods

# Check pod resource requests/limits
kubectl describe pod -l app=video-streaming-app
```

#### 3. Image Pull Issues

```bash
# Rebuild and ensure image is available
docker build -t video-streaming:latest .
docker images | grep video-streaming

# For production, push to container registry
# docker tag video-streaming:latest your-registry/video-streaming:latest
# docker push your-registry/video-streaming:latest
```

#### 4. Service Not Accessible

```bash
# Check service status
kubectl get svc video-streaming-service

# Use port-forward for direct access
kubectl port-forward svc/video-streaming-service 8080:80

# Check pod logs for errors
kubectl logs -l app=video-streaming-app
```

### Debug Commands

```bash
# Get all resources
kubectl get all -l app=video-streaming-app

# Describe deployment for detailed information
kubectl describe deployment video-streaming-app

# Check events in the namespace
kubectl get events --sort-by=.metadata.creationTimestamp

# Access pod shell for debugging
kubectl exec -it <pod-name> -- /bin/sh
```

## 🧹 Cleanup

### Remove Kubernetes Resources

```bash
# Delete all application resources
kubectl delete -f k8s/

# Or delete individually
kubectl delete hpa video-streaming-hpa
kubectl delete svc video-streaming-service
kubectl delete deployment video-streaming-app

# Verify cleanup
kubectl get all -l app=video-streaming-app
```

### Clean Docker Resources

```bash
# Remove containers
docker rm -f video-streaming-app

# Remove image
docker rmi video-streaming:latest

# Clean up Docker system (optional)
docker system prune -f
```

## 📈 Performance Testing

### Scaling Verification

1. **Baseline Test**:
   ```bash
   # Check initial pod count
   kubectl get pods -l app=video-streaming-app
   ```

2. **Load Generation**:
   ```bash
   # Generate sustained load
   for i in {1..100}; do
     curl "http://localhost:8080/burn?ms=1500" &
   done
   ```

3. **Monitor Scaling**:
   ```bash
   # Watch HPA decisions
   kubectl get hpa video-streaming-hpa --watch
   
   # Monitor resource usage
   kubectl top pods -l app=video-streaming-app
   ```

### Expected Scaling Behavior

- **Scale Up**: When CPU > 50% or Memory > 60%
- **Scale Down**: After 5 minutes of low utilization
- **Min Replicas**: 1
- **Max Replicas**: 10

## 🔒 Security Features

- **Container Security**: Non-root user, read-only filesystem where possible
- **Network Security**: Rate limiting, CORS configuration
- **Resource Limits**: CPU and memory constraints
- **Health Checks**: Liveness and readiness probes
- **Security Headers**: Helmet.js protection

## 🛠 Development

### Local Development

```bash
# Start development server with hot reload
npm run dev

# Run linting
npm run lint

# Format code
npm run format

# Run tests
npm test
```

### Code Quality

```bash
# Lint and fix
npm run lint:fix

# Format code
npm run format

# Clean build artifacts
npm run clean
```

## 📝 API Examples

### Video Upload

```bash
curl -X POST \
  -F "video=@your-video.mp4" \
  http://localhost:8080/api/v1/videos/upload
```

### Video Streaming

```html
<!-- HTML5 Video Player -->
<video controls>
  <source src="http://localhost:8080/video/master.m3u8" type="application/vnd.apple.mpegurl">
</video>
```

## 🎯 Production Deployment

For production deployment:

1. **Container Registry**:
   ```bash
   # Tag and push to your registry
   docker tag video-streaming:latest your-registry.com/video-streaming:v1.0.0
   docker push your-registry.com/video-streaming:v1.0.0
   ```

2. **Update Kubernetes Manifests**:
   - Update image reference in `k8s/deployment.yaml`
   - Configure appropriate resource limits
   - Set production environment variables

3. **Security Considerations**:
   - Use secrets for sensitive configuration
   - Configure ingress with TLS
   - Implement proper RBAC
   - Set up monitoring and alerting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

---

**Author**: Raghvendra Awasthi  
**Version**: 1.0.0  
**Node.js**: 22.x  
**Kubernetes**: Compatible with Docker Desktop Kubernetes
