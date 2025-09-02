#!/bin/bash

# HPA Testing Script for Video Streaming Platform
# This script runs comprehensive load tests and monitors HPA scaling behavior

set -euo pipefail

# Configuration
TEST_DURATION=${TEST_DURATION:-600}  # 10 minutes default
NAMESPACE=${NAMESPACE:-default}
SERVICE_NAME=${SERVICE_NAME:-video-streaming-service}
DEPLOYMENT_NAME=${DEPLOYMENT_NAME:-video-streaming-app}
HPA_NAME=${HPA_NAME:-video-streaming-hpa}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🎬 VIDEO STREAMING PLATFORM - HPA TESTING SUITE${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# Function to print colored status
print_status() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING: $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR: $1${NC}"
}

print_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if artillery is available
    if ! command -v artillery &> /dev/null; then
        print_error "Artillery is not installed. Run: npm install -g artillery"
        exit 1
    fi
    
    # Check if Docker Desktop Kubernetes is running
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Kubernetes cluster is not accessible"
        exit 1
    fi
    
    print_status "Prerequisites check passed ✅"
}

# Check if deployment exists
check_deployment() {
    print_status "Checking if deployment exists..."
    
    if ! kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE &> /dev/null; then
        print_error "Deployment '$DEPLOYMENT_NAME' not found in namespace '$NAMESPACE'"
        print_info "Deploy the application first using: kubectl apply -f k8s/"
        exit 1
    fi
    
    print_status "Deployment found ✅"
}

# Check if HPA exists
check_hpa() {
    print_status "Checking HPA configuration..."
    
    if ! kubectl get hpa $HPA_NAME -n $NAMESPACE &> /dev/null; then
        print_error "HPA '$HPA_NAME' not found in namespace '$NAMESPACE'"
        print_info "Create HPA using: kubectl apply -f k8s/hpa.yaml"
        exit 1
    fi
    
    # Show current HPA status
    echo -e "${PURPLE}Current HPA Status:${NC}"
    kubectl get hpa $HPA_NAME -n $NAMESPACE
    echo ""
    
    print_status "HPA found ✅"
}

# Check metrics server
check_metrics_server() {
    print_status "Checking metrics server..."
    
    if ! kubectl get deployment metrics-server -n kube-system &> /dev/null; then
        print_warning "Metrics server not found. HPA may not work correctly."
        print_info "Install metrics server for Docker Desktop:"
        print_info "kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
        print_info "kubectl patch -n kube-system deployment metrics-server --type=json -p='[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--kubelet-insecure-tls\"}]'"
        
        read -p "Continue without metrics server? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        print_status "Metrics server found ✅"
    fi
}

# Get current pod count
get_pod_count() {
    kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0"
}

# Monitor HPA and pods during test
monitor_scaling() {
    local test_duration=$1
    local log_file="hpa-test-$(date +%Y%m%d-%H%M%S).log"
    
    print_status "Starting HPA monitoring (logs: $log_file)..."
    
    # Background monitoring process
    (
        echo "=== HPA SCALING MONITOR START: $(date) ===" >> $log_file
        local start_time=$(date +%s)
        local end_time=$((start_time + test_duration))
        
        while [ $(date +%s) -lt $end_time ]; do
            local timestamp=$(date '+%H:%M:%S')
            local pods=$(get_pod_count)
            local hpa_status=$(kubectl get hpa $HPA_NAME -n $NAMESPACE --no-headers 2>/dev/null || echo "ERROR")
            
            echo "[$timestamp] Pods: $pods | HPA: $hpa_status" | tee -a $log_file
            
            # Also log detailed pod information every 30 seconds
            if [ $(($(date +%s) % 30)) -eq 0 ]; then
                echo "[$timestamp] Detailed pod status:" >> $log_file
                kubectl get pods -l app=video-streaming-app -n $NAMESPACE >> $log_file 2>&1
                echo "[$timestamp] HPA detailed status:" >> $log_file
                kubectl describe hpa $HPA_NAME -n $NAMESPACE >> $log_file 2>&1
                echo "---" >> $log_file
            fi
            
            sleep 5
        done
        
        echo "=== HPA SCALING MONITOR END: $(date) ===" >> $log_file
    ) &
    
    local monitor_pid=$!
    echo $monitor_pid > .monitor_pid
    
    print_info "HPA monitoring started (PID: $monitor_pid)"
    return 0
}

# Stop monitoring
stop_monitoring() {
    if [ -f .monitor_pid ]; then
        local monitor_pid=$(cat .monitor_pid)
        kill $monitor_pid 2>/dev/null || true
        rm -f .monitor_pid
        print_status "HPA monitoring stopped"
    fi
}

# Run load test
run_load_test() {
    local test_type=${1:-"simple"}
    local environment=${2:-"local"}
    
    print_status "Starting load test: $test_type (environment: $environment)"
    print_info "This will generate significant load to trigger HPA scaling"
    
    # Start monitoring
    monitor_scaling $TEST_DURATION
    
    # Run the load test
    case $test_type in
        "simple")
            npm run load:quick -- -e $environment
            ;;
        "hpa")
            npm run load:hpa -- -e $environment
            ;;
        "full")
            npm run load:full -- -e $environment
            ;;
        "custom")
            TARGET_URL="http://localhost:8080" \
            TOTAL_USERS=10000 \
            DURATION_MINUTES=10 \
            RAMP_UP_MINUTES=2 \
            npm run load:custom
            ;;
        *)
            print_error "Unknown test type: $test_type"
            print_info "Available types: simple, hpa, full, custom"
            exit 1
            ;;
    esac
    
    # Stop monitoring
    stop_monitoring
}

# Display final results
show_results() {
    print_status "Load test completed! Collecting final metrics..."
    echo ""
    
    echo -e "${PURPLE}📊 FINAL KUBERNETES METRICS:${NC}"
    echo -e "${PURPLE}=============================${NC}"
    
    echo -e "${CYAN}HPA Status:${NC}"
    kubectl get hpa $HPA_NAME -n $NAMESPACE
    echo ""
    
    echo -e "${CYAN}Pod Status:${NC}"
    kubectl get pods -l app=video-streaming-app -n $NAMESPACE
    echo ""
    
    echo -e "${CYAN}Deployment Status:${NC}"
    kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE
    echo ""
    
    echo -e "${CYAN}Resource Usage (if available):${NC}"
    kubectl top pods -l app=video-streaming-app -n $NAMESPACE 2>/dev/null || echo "Metrics not available"
    echo ""
    
    # Show recent HPA events
    echo -e "${CYAN}Recent HPA Events:${NC}"
    kubectl describe hpa $HPA_NAME -n $NAMESPACE | tail -20
    echo ""
    
    print_status "Check application metrics at: http://localhost:8080/metrics"
    print_status "View load test logs in: hpa-test-*.log files"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    stop_monitoring
    
    # Clean up any load test jobs in Kubernetes
    kubectl delete job video-streaming-load-test -n $NAMESPACE 2>/dev/null || true
    
    print_status "Cleanup completed"
}

# Signal handlers
trap cleanup EXIT
trap 'print_warning "Interrupted by user"; cleanup; exit 1' INT

# Main function
main() {
    local test_type=${1:-"simple"}
    local environment=${2:-"local"}
    
    print_status "Starting HPA test suite..."
    print_info "Test type: $test_type"
    print_info "Environment: $environment"
    print_info "Duration: ${TEST_DURATION}s"
    echo ""
    
    # Run all checks
    check_prerequisites
    check_deployment
    check_hpa
    check_metrics_server
    
    # Show initial state
    echo -e "${PURPLE}📋 INITIAL STATE:${NC}"
    echo -e "${PURPLE}=================${NC}"
    echo -e "${CYAN}Current pods:${NC} $(get_pod_count)"
    kubectl get hpa $HPA_NAME -n $NAMESPACE
    echo ""
    
    # Confirm start
    read -p "Start load test? This will generate high CPU load. (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Test cancelled by user"
        exit 0
    fi
    
    # Run the test
    run_load_test $test_type $environment
    
    # Show results
    show_results
    
    print_status "🎉 HPA testing completed successfully!"
}

# Help function
show_help() {
    echo "Usage: $0 [test_type] [environment]"
    echo ""
    echo "Test Types:"
    echo "  simple  - Quick validation test (default)"
    echo "  hpa     - HPA-focused CPU intensive test"
    echo "  full    - Full comprehensive test"
    echo "  custom  - Custom Node.js load tester"
    echo ""
    echo "Environments:"
    echo "  local      - Local development (localhost:8080)"
    echo "  kubernetes - Kubernetes NodePort (localhost:30080)"
    echo "  docker     - Docker service (localhost:8082)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Quick test on local"
    echo "  $0 hpa kubernetes           # HPA test on Kubernetes"
    echo "  $0 full local               # Full test on local"
    echo "  $0 custom                   # Custom Node.js tester"
    echo ""
    echo "Environment Variables:"
    echo "  TEST_DURATION=600           # Test duration in seconds"
    echo "  NAMESPACE=default           # Kubernetes namespace"
    echo "  SERVICE_NAME=video-streaming-service"
    echo "  DEPLOYMENT_NAME=video-streaming-app"
    echo "  HPA_NAME=video-streaming-hpa"
}

# Handle help
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# Run main function
main "$@"
