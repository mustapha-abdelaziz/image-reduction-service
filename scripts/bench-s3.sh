#!/usr/bin/env bash

# Benchmark S3 redaction endpoint
#
# Usage: ./scripts/bench-s3.sh [URL] [API_KEY]
#
# Requirements:
#   - curl
#   - jq (optional, for formatted output)

set -e

URL="${1:-http://localhost:3000/v1/redact/s3}"
API_KEY="${2:-dev-123}"
DURATION=60
CONCURRENCY=8
ITERATIONS=$((DURATION * CONCURRENCY / 2))  # Approximate

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Image Redactor Service - S3 Benchmark ===${NC}"
echo ""
echo "URL: $URL"
echo "Duration: ~${DURATION}s"
echo "Concurrency: $CONCURRENCY"
echo "Estimated iterations: $ITERATIONS"
echo ""

# Create bench directory
mkdir -p bench

# Create test request
cat > bench/s3-request.json <<'EOF'
{
  "input": {
    "bucket": "test-input-bucket",
    "key": "test-images/sample-1080p.jpg"
  },
  "output": {
    "bucket": "test-output-bucket",
    "key": "redacted/sample-1080p-redacted.webp",
    "format": "webp",
    "quality": 85
  },
  "regions": [
    {
      "coordinates": {"x": 200, "y": 200, "width": 400, "height": 300},
      "operation": {"type": "blur", "size": "M"}
    },
    {
      "coordinates": {"x_norm": 0.6, "y_norm": 0.6, "w_norm": 0.3, "h_norm": 0.3},
      "operation": {"type": "pixelate", "size": "L"}
    }
  ],
  "idempotency_key": "bench-test-key-{{timestamp}}"
}
EOF

echo -e "${YELLOW}Note: This benchmark requires S3 configuration and test images in place.${NC}"
echo "Make sure the following are configured:"
echo "  - S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in .env"
echo "  - Test image exists at s3://test-input-bucket/test-images/sample-1080p.jpg"
echo ""
echo -e "${YELLOW}Starting benchmark in 3 seconds...${NC}"
sleep 3

# Initialize results file
echo "timestamp_ms,status_code,processing_time_ms,total_time_ms" > bench/s3-results.csv

echo -e "${YELLOW}Running benchmark...${NC}"

# Function to make a single request
make_request() {
  local idx=$1
  local start_ms=$(date +%s%3N)

  # Replace timestamp placeholder
  local request_body=$(cat bench/s3-request.json | sed "s/{{timestamp}}/${start_ms}-${idx}/g")

  # Make request
  local response=$(curl -s -w "\n%{http_code}" \
    -X POST "$URL" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$request_body")

  local end_ms=$(date +%s%3N)
  local total_time=$((end_ms - start_ms))

  # Parse response
  local body=$(echo "$response" | head -n -1)
  local status=$(echo "$response" | tail -n 1)

  # Extract processing time if available
  local processing_time=""
  if command -v jq &> /dev/null; then
    processing_time=$(echo "$body" | jq -r '.processing_time_ms // empty' 2>/dev/null || echo "")
  fi

  # Log result
  echo "${start_ms},${status},${processing_time},${total_time}" >> bench/s3-results.csv

  # Progress indicator
  if [ $((idx % 10)) -eq 0 ]; then
    echo -n "."
  fi
}

# Run concurrent requests
export -f make_request
export URL API_KEY

# Simple parallel execution
for i in $(seq 1 $ITERATIONS); do
  make_request $i &

  # Limit concurrency
  if [ $((i % CONCURRENCY)) -eq 0 ]; then
    wait
  fi
done

wait

echo ""
echo -e "${GREEN}=== Results ===${NC}"

# Calculate statistics
if command -v awk &> /dev/null; then
  echo ""
  echo "Processing Time (ms):"
  awk -F',' 'NR>1 && $3!="" {sum+=$3; count++; if(min==""){min=max=$3}; if($3>max){max=$3}; if($3<min){min=$3}; times[count]=$3} END {if(count>0){asort(times); print "  Mean: " sum/count; print "  Min: " min; print "  Max: " max; p50=int(count*0.5); p95=int(count*0.95); p99=int(count*0.99); print "  P50: " times[p50]; print "  P95: " times[p95]; print "  P99: " times[p99]}}' bench/s3-results.csv

  echo ""
  echo "Total Time (ms):"
  awk -F',' 'NR>1 {sum+=$4; count++; if(min==""){min=max=$4}; if($4>max){max=$4}; if($4<min){min=$4}; times[count]=$4} END {asort(times); print "  Mean: " sum/count; print "  Min: " min; print "  Max: " max; p50=int(count*0.5); p95=int(count*0.95); p99=int(count*0.99); print "  P50: " times[p50]; print "  P95: " times[p95]; print "  P99: " times[p99]}' bench/s3-results.csv

  echo ""
  echo "Status Codes:"
  awk -F',' 'NR>1 {codes[$2]++} END {for(code in codes) print "  " code ": " codes[code]}' bench/s3-results.csv

  echo ""
  echo "Total Requests:"
  awk -F',' 'END {print "  " NR-1}' bench/s3-results.csv
fi

echo ""
echo -e "${GREEN}Benchmark complete!${NC}"
echo "Detailed results: bench/s3-results.csv"
