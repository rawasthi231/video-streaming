#!/bin/bash

# Real-time Concurrent Users Monitor
# Shows live statistics about concurrent users and their activity

TARGET_URL=${1:-"http://localhost:30080"}
REFRESH_INTERVAL=${2:-3}  # seconds

echo "👥 Concurrent Users Monitor - $TARGET_URL"
echo "🔄 Refresh interval: $REFRESH_INTERVAL seconds"
echo "🛑 Press Ctrl+C to stop monitoring"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

while true; do
    # Clear screen and move cursor to top
    clear
    
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BOLD}👥 CONCURRENT USERS DASHBOARD${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "🕐 Last Updated: ${CYAN}$timestamp${NC}"
    echo ""
    
    # Fetch user stats
    response=$(curl -s "$TARGET_URL/users" --max-time 10 2>/dev/null)
    
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        # Parse JSON response (requires jq, but fallback if not available)
        if command -v jq &> /dev/null; then
            current_users=$(echo "$response" | jq -r '.data.concurrent.current // 0')
            peak_users=$(echo "$response" | jq -r '.data.concurrent.peak // 0')
            total_sessions=$(echo "$response" | jq -r '.data.concurrent.total_sessions // 0')
            total_requests=$(echo "$response" | jq -r '.data.activity.total_requests // 0')
            avg_requests=$(echo "$response" | jq -r '.data.activity.avg_requests_per_user // 0')
            
            echo -e "${BOLD}📊 CURRENT METRICS${NC}"
            echo -e "   ${GREEN}🟢 Current Users:${NC} $current_users"
            echo -e "   ${YELLOW}📈 Peak Users:${NC} $peak_users"
            echo -e "   ${BLUE}📋 Total Sessions:${NC} $total_sessions"
            echo -e "   ${CYAN}🔄 Total Requests:${NC} $total_requests"
            echo -e "   ${CYAN}📊 Avg Req/User:${NC} $avg_requests"
            echo ""
            
            # User agent breakdown
            echo -e "${BOLD}🌐 USER AGENT BREAKDOWN${NC}"
            echo "$response" | jq -r '.data.breakdown.by_user_agent | to_entries[] | "   \(.key): \(.value)"' 2>/dev/null | while read line; do
                if [[ $line == *"Artillery"* ]]; then
                    echo -e "   ${YELLOW}🔥 $line${NC}"
                elif [[ $line == *"Browser"* ]]; then
                    echo -e "   ${GREEN}🌐 $line${NC}"
                elif [[ $line == *"curl"* ]]; then
                    echo -e "   ${BLUE}⚡ $line${NC}"
                else
                    echo -e "   ${CYAN}📱 $line${NC}"
                fi
            done
            echo ""
            
            # Active sessions (show first 10)
            echo -e "${BOLD}👤 ACTIVE SESSIONS (Last 10)${NC}"
            echo "$response" | jq -r '.data.sessions[0:10][] | "   ID: \(.id) | IP: \(.ip) | Duration: \(.duration_seconds)s | Requests: \(.requests) | Last: \(.last_activity_seconds_ago)s ago"' 2>/dev/null | while read line; do
                echo -e "   ${CYAN}$line${NC}"
            done
            
        else
            # Fallback parsing without jq
            echo -e "${YELLOW}⚠️  jq not available - showing raw JSON:${NC}"
            echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
        fi
        
    else
        echo -e "${RED}❌ Failed to fetch user statistics${NC}"
        echo "   Endpoint: $TARGET_URL/users"
        echo "   Check if the application is running and accessible"
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${CYAN}Press Ctrl+C to exit${NC}"
    
    sleep $REFRESH_INTERVAL
done
