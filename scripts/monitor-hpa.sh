#!/bin/bash

# HPA Monitoring Script
# Monitors Kubernetes HPA scaling behavior in real-time

set -euo pipefail

# Configuration
NAMESPACE=${NAMESPACE:-default}
HPA_NAME=${HPA_NAME:-video-streaming-hpa}
DEPLOYMENT_NAME=${DEPLOYMENT_NAME:-video-streaming-app}
REFRESH_INTERVAL=${REFRESH_INTERVAL:-5}
LOG_FILE=${LOG_FILE:-"hpa-monitor-$(date +%Y%m%d-%H%M%S).log"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🔍 HPA SCALING MONITOR${NC}"
echo -e "${CYAN}======================${NC}"
echo -e "${BLUE}Namespace: ${NAMESPACE}${NC}"
echo -e "${BLUE}HPA: ${HPA_NAME}${NC}"
echo -e "${BLUE}Deployment: ${DEPLOYMENT_NAME}${NC}"
echo -e "${BLUE}Refresh: ${REFRESH_INTERVAL}s${NC}"
echo -e "${BLUE}Log file: ${LOG_FILE}${NC}"
echo ""

# Initialize log file
echo "=== HPA MONITORING SESSION START: $(date) ===" > "$LOG_FILE"

# Function to get HPA metrics
get_hpa_metrics() {
    local timestamp=$(date '+%H:%M:%S')
    
    # Get HPA status
    local hpa_info=$(kubectl get hpa $HPA_NAME -n $NAMESPACE --no-headers 2>/dev/null || echo "ERROR: HPA not found")
    
    # Get deployment replica count
    local current_replicas=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
    local ready_replicas=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    
    # Get CPU usage if available
    local cpu_usage=$(kubectl top pods -l app=video-streaming-app -n $NAMESPACE --no-headers 2>/dev/null | awk '{sum+=$2} END {print sum "m"}' || echo "N/A")
    
    # Get memory usage if available
    local memory_usage=$(kubectl top pods -l app=video-streaming-app -n $NAMESPACE --no-headers 2>/dev/null | awk '{sum+=$3} END {print sum "Mi"}' || echo "N/A")
    
    echo -e "${CYAN}[$timestamp]${NC} Pods: ${GREEN}${ready_replicas}/${current_replicas}${NC} | CPU: ${YELLOW}${cpu_usage}${NC} | Memory: ${YELLOW}${memory_usage}${NC}"
    echo -e "${PURPLE}HPA:${NC} $hpa_info"
    
    # Log to file
    echo "[$timestamp] Replicas: $ready_replicas/$current_replicas | CPU: $cpu_usage | Memory: $memory_usage" >> "$LOG_FILE"
    echo "[$timestamp] HPA: $hpa_info" >> "$LOG_FILE"
    
    return 0
}

# Function to show detailed HPA status
show_detailed_status() {
    echo ""
    echo -e "${PURPLE}📊 DETAILED HPA STATUS:${NC}"
    echo -e "${PURPLE}========================${NC}"
    
    kubectl describe hpa $HPA_NAME -n $NAMESPACE | grep -E "(Current|Desired|Min|Max|Targets|Events)" -A 20
    
    echo ""
    echo -e "${PURPLE}🏃 POD STATUS:${NC}"
    echo -e "${PURPLE}==============${NC}"
    kubectl get pods -l app=video-streaming-app -n $NAMESPACE -o wide
    
    echo ""
}

# Function to watch HPA events
watch_hpa_events() {
    echo -e "${PURPLE}📝 RECENT HPA EVENTS:${NC}"
    echo -e "${PURPLE}===================${NC}"
    kubectl get events --field-selector involvedObject.name=$HPA_NAME -n $NAMESPACE --sort-by=.lastTimestamp | tail -5
    echo ""
}

# Cleanup function
cleanup() {
    echo ""
    echo -e "${GREEN}🏁 Monitoring session ended${NC}"
    echo "=== HPA MONITORING SESSION END: $(date) ===" >> "$LOG_FILE"
    
    # Final summary
    show_detailed_status
    
    echo -e "${BLUE}📁 Full monitoring log saved to: ${LOG_FILE}${NC}"
    exit 0
}

# Signal handlers
trap cleanup EXIT
trap 'echo -e "\n${YELLOW}⚠️  Interrupted by user${NC}"; cleanup' INT

# Initial check
if ! kubectl get hpa $HPA_NAME -n $NAMESPACE &>/dev/null; then
    echo -e "${RED}❌ HPA '$HPA_NAME' not found in namespace '$NAMESPACE'${NC}"
    exit 1
fi

if ! kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE &>/dev/null; then
    echo -e "${RED}❌ Deployment '$DEPLOYMENT_NAME' not found in namespace '$NAMESPACE'${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Starting HPA monitoring...${NC}"
echo -e "${YELLOW}📋 Press Ctrl+C to stop monitoring and show final summary${NC}"
echo ""

# Initial detailed status
show_detailed_status

# Main monitoring loop
counter=0
while true; do
    get_hpa_metrics
    
    # Show detailed status every 60 seconds (12 iterations * 5 seconds)
    if [ $((counter % 12)) -eq 0 ] && [ $counter -gt 0 ]; then
        show_detailed_status
        watch_hpa_events
    fi
    
    counter=$((counter + 1))
    sleep $REFRESH_INTERVAL
done
