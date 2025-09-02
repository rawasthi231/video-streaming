#!/bin/bash

# Video Streaming App - Availability Monitor
# Continuously checks app availability during load testing

TARGET_URL=${1:-"http://localhost:30080"}
CHECK_INTERVAL=${2:-5}  # seconds

echo "🔍 Monitoring application availability at: $TARGET_URL"
echo "📊 Check interval: $CHECK_INTERVAL seconds"
echo "🛑 Press Ctrl+C to stop monitoring"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

consecutive_failures=0
total_checks=0
successful_checks=0

while true; do
    total_checks=$((total_checks + 1))
    timestamp=$(date '+%H:%M:%S')
    
    # Test health endpoint
    health_response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" "$TARGET_URL/health" --max-time 10)
    health_code=$(echo $health_response | cut -d':' -f1)
    health_time=$(echo $health_response | cut -d':' -f2)
    
    # Test main page
    main_response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}" "$TARGET_URL/" --max-time 10)
    main_code=$(echo $main_response | cut -d':' -f1)
    main_time=$(echo $main_response | cut -d':' -f2)
    
    # Get concurrent user stats (only every 3rd check to reduce overhead)
    concurrent_users="N/A"
    if [[ $((total_checks % 3)) -eq 0 ]]; then
        users_response=$(curl -s "$TARGET_URL/users" --max-time 5 2>/dev/null | jq -r '.data.concurrent.current // "N/A"' 2>/dev/null || echo "N/A")
        concurrent_users="$users_response"
    fi
    
    if [[ "$health_code" == "200" && "$main_code" == "200" ]]; then
        consecutive_failures=0
        successful_checks=$((successful_checks + 1))
        success_rate=$(echo "scale=1; $successful_checks * 100 / $total_checks" | bc -l)
        printf "${GREEN}✅ [$timestamp] APP AVAILABLE${NC} - Health: ${health_time}s, Main: ${main_time}s, Users: ${concurrent_users} (${success_rate}%% uptime)\n"
    else
        consecutive_failures=$((consecutive_failures + 1))
        success_rate=$(echo "scale=1; $successful_checks * 100 / $total_checks" | bc -l)
        printf "${RED}❌ [$timestamp] APP UNAVAILABLE${NC} - Health: $health_code, Main: $main_code, Users: ${concurrent_users} (${success_rate}%% uptime)\n"
        
        if [[ $consecutive_failures -ge 3 ]]; then
            printf "${YELLOW}⚠️  Application has been unavailable for $((consecutive_failures * CHECK_INTERVAL)) seconds${NC}\n"
        fi
    fi
    
    sleep $CHECK_INTERVAL
done
