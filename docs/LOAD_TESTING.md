# Load Testing & HPA Validation Guide

This guide covers comprehensive load testing procedures for the Video Streaming Platform to validate Kubernetes Horizontal Pod Autoscaler (HPA) behavior.

## 🚀 Quick Start

### Prerequisites
- Docker Desktop with Kubernetes enabled
- Node.js 22+ installed
- Application deployed to Kubernetes

### 1. Deploy Application
```bash
# Build and deploy
npm run build
docker build -t video-streaming-app .
kubectl apply -f k8s/

# Verify deployment
kubectl get pods -l app=video-streaming-app
kubectl get hpa video-streaming-hpa
```

### 2. Run Load Tests
```bash
# Quick validation test (recommended first)
npm run load:quick

# HPA-focused test with CPU intensive workloads
npm run load:hpa

# Full comprehensive test
npm run load:full

# Target Kubernetes directly
npm run load:k8s
```

### 3. Monitor HPA Scaling
```bash
# In a separate terminal, monitor HPA behavior
./scripts/monitor-hpa.sh

# Or watch manually
kubectl get hpa --watch
```

## 📊 Load Testing Scenarios

### Available Test Types

1. **Quick Validation (`npm run load:quick`)**
   - Duration: ~11 minutes
   - Gradual ramp-up to validate basic functionality
   - Good for initial testing

2. **HPA Test (`npm run load:hpa`)**
   - Duration: ~15 minutes
   - CPU-intensive workloads to trigger scaling
   - Designed specifically for HPA validation

3. **Full Test (`npm run load:full`)**
   - Duration: ~35 minutes
   - Comprehensive scenarios including video streaming
   - Complete load testing suite

4. **Custom Test (`npm run load:custom`)**
   - Node.js-based load tester
   - Configurable via environment variables
   - Simulates realistic user behaviors

### User Scenarios Included

| Scenario | Weight | Description |
|----------|--------|-------------|
| Video Browser | 40% | Browses homepage, video lists, searches |
| Video Viewer | 35% | Watches videos, streams HLS content |
| API User | 15% | Makes API calls, checks health endpoints |
| CPU Burner | 5-20% | CPU-intensive requests to trigger HPA |
| Upload Simulation | 5% | Simulates video upload workflow |

## 🎯 HPA Testing Strategy

### Phase 1: Baseline Establishment
- Start with minimal load (5-10 req/sec)
- Verify single pod handles baseline traffic
- Record baseline CPU/memory usage

### Phase 2: Scaling Trigger
- Gradually increase CPU-intensive requests
- Monitor for HPA scaling events
- Expected: Pods should scale up when CPU > 70%

### Phase 3: Sustained Load
- Maintain high load to test scaling stability
- Verify all pods are healthy and serving traffic
- Monitor for any oscillation in pod count

### Phase 4: Peak Burst
- Generate maximum load to test scaling limits
- Verify HPA respects maxReplicas setting
- Monitor for rate limiting and error rates

### Phase 5: Scale Down
- Reduce load gradually
- Monitor scale-down behavior (default: 5-minute cooldown)
- Verify pods are terminated gracefully

## 🔧 Configuration Options

### Environment Variables

#### For Artillery Tests
```bash
# Change target URL
TARGET_URL=http://localhost:30080 npm run load:quick

# Use different environment
npm run load:k8s  # Targets Kubernetes NodePort
```

#### For Custom Load Tester
```bash
TARGET_URL=http://localhost:8080 \
TOTAL_USERS=50000 \
DURATION_MINUTES=10 \
RAMP_UP_MINUTES=2 \
WORKERS=4 \
npm run load:custom
```

#### For HPA Monitoring
```bash
NAMESPACE=default \
HPA_NAME=video-streaming-hpa \
DEPLOYMENT_NAME=video-streaming-app \
REFRESH_INTERVAL=5 \
./scripts/monitor-hpa.sh
```

## 📈 Metrics and Monitoring

### Key Metrics to Watch

1. **HPA Metrics**
   - Current CPU utilization
   - Target CPU utilization (70%)
   - Current/Desired replica count
   - Scaling events

2. **Application Metrics**
   - Request throughput (req/sec)
   - Response times
   - Error rates
   - Active video streams

3. **Kubernetes Metrics**
   - Pod CPU/Memory usage
   - Pod readiness status
   - Cluster resource utilization

### Monitoring Commands

```bash
# Watch HPA status
kubectl get hpa --watch

# Monitor pod resources
kubectl top pods -l app=video-streaming-app

# View scaling events
kubectl describe hpa video-streaming-hpa

# Check application metrics
curl http://localhost:8080/metrics

# Monitor pod logs
kubectl logs -f deployment/video-streaming-app
```

## 🎛️ Advanced Testing

### Distributed Load Testing in Kubernetes

Deploy load testing pods inside the cluster:

```bash
# Deploy load test job
kubectl apply -f k8s/load-test-job.yaml

# Monitor load test pods
kubectl get jobs
kubectl logs -f job/video-streaming-load-test

# Clean up
kubectl delete -f k8s/load-test-job.yaml
```

### Custom Scaling Policies

Test with different HPA configurations:

```yaml
# Example: Memory-based scaling
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: video-streaming-hpa-memory
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: video-streaming-app
  minReplicas: 1
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Testing Different Load Patterns

```bash
# Spike test - sudden traffic increase
artillery quick --duration 60 --rate 100 http://localhost:8080/burn?ms=2000

# Soak test - extended duration
artillery quick --duration 1800 --rate 20 http://localhost:8080/

# Stress test - high load to find breaking point
artillery quick --duration 300 --rate 200 http://localhost:8080/burn?ms=1000
```

## 🐛 Troubleshooting

### Common Issues

1. **HPA Not Scaling**
   - Check metrics server: `kubectl get deployment metrics-server -n kube-system`
   - Verify resource requests in deployment
   - Check HPA events: `kubectl describe hpa video-streaming-hpa`

2. **High Error Rates**
   - Rate limiting active (HTTP 429) - expected under high load
   - Check application logs: `kubectl logs deployment/video-streaming-app`
   - Monitor resource limits

3. **Slow Scaling**
   - Default scale-up: 15% every 15 seconds
   - Default scale-down: after 5 minutes of low utilization
   - Adjust HPA behavior if needed

### Metrics Server Setup (Docker Desktop)

If metrics are not available:

```bash
# Install metrics server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Patch for Docker Desktop (insecure TLS)
kubectl patch -n kube-system deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

# Verify installation
kubectl get deployment metrics-server -n kube-system
kubectl top nodes
```

## 📊 Results Analysis

### Expected Scaling Behavior

| Load Level | Expected Pods | CPU Target | Notes |
|------------|---------------|------------|-------|
| Baseline | 1 | < 30% | Single pod handles light load |
| Medium | 2-3 | 50-70% | Gradual scaling as load increases |
| High | 4-6 | 70-80% | Active scaling to meet demand |
| Peak | 6-10 | 70-85% | Maximum scaling (respects limits) |

### Success Criteria

- ✅ HPA scales up when CPU > 70%
- ✅ HPA scales down when CPU < 30% for 5+ minutes
- ✅ All pods remain healthy during scaling
- ✅ Application maintains < 5% error rate under load
- ✅ Response times remain acceptable (< 2s avg)

### Performance Benchmarks

| Metric | Target | Notes |
|--------|--------|-------|
| Throughput | > 100 req/sec | Per pod under normal load |
| Response Time | < 500ms | 95th percentile |
| Error Rate | < 1% | Under normal load conditions |
| Scaling Time | < 60s | Time to provision new pod |

## 🔧 Customization

### Creating Custom Scenarios

Edit `load-testing/artillery-config.yml` to add new scenarios:

```yaml
scenarios:
  - name: "Custom Scenario"
    weight: 10
    flow:
      - get:
          url: "/custom-endpoint"
      - think: 2
      - post:
          url: "/api/custom"
          json:
            key: "value"
```

### Adjusting HPA Thresholds

Modify `k8s/hpa.yaml`:

```yaml
spec:
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50  # Lower threshold for faster scaling
```

## 📝 Best Practices

1. **Start Small**: Begin with light load to validate basic functionality
2. **Monitor Resources**: Watch both application and cluster resources
3. **Test Gradually**: Increase load incrementally to find limits
4. **Document Results**: Save logs and metrics for analysis
5. **Clean Up**: Remove test resources after completion

## 🚨 Safety Notes

- **Never run against production**: These tests generate significant load
- **Monitor resource usage**: Ensure your local machine can handle the load
- **Use rate limiting**: Built-in rate limiting protects against excessive load
- **Stop if needed**: Use Ctrl+C to stop tests immediately

## 📁 Generated Files

After running tests, you'll find:

- `load-test-results.json` - Detailed test metrics
- `hpa-monitor-*.log` - HPA scaling logs  
- `artillery-report.json` - Artillery test report

## 🔗 Additional Resources

- [Kubernetes HPA Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Artillery.js Documentation](https://artillery.io/docs/)
- [Prometheus Metrics](http://localhost:8080/metrics)
- [Application API Docs](http://localhost:8080/docs)
