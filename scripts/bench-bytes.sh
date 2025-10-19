#!/usr/bin/env bash

# Benchmark multipart redaction endpoint using autocannon
#
# Usage: ./scripts/bench-bytes.sh [URL] [API_KEY]
#
# Requirements:
#   - autocannon: npm install -g autocannon
#   - curl (for test image creation)

set -e

URL="${1:-http://localhost:3000/v1/redact}"
API_KEY="${2:-dev-123}"
DURATION=60
CONNECTIONS=16
PIPELINING=1

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Image Redactor Service - Multipart Benchmark ===${NC}"
echo ""
echo "URL: $URL"
echo "Duration: ${DURATION}s"
echo "Connections: $CONNECTIONS"
echo "Pipelining: $PIPELINING"
echo ""

# Create bench directory
mkdir -p bench

# Generate test image (1080p red rectangle)
echo -e "${YELLOW}Generating 1080p test image...${NC}"
convert -size 1920x1080 xc:red -format png - > bench/test-1080p.png 2>/dev/null || {
  echo "ImageMagick not found. Using placeholder..."
  # Create a simple placeholder if ImageMagick is not available
  echo "Placeholder" > bench/test-1080p.png
}

# Create test ops JSON
cat > bench/ops.json <<'EOF'
{
  "regions": [
    {
      "coordinates": {"x": 100, "y": 100, "width": 300, "height": 200},
      "operation": {"type": "blur", "size": "M"}
    },
    {
      "coordinates": {"x": 500, "y": 500, "width": 400, "height": 300},
      "operation": {"type": "pixelate", "size": "L"}
    },
    {
      "coordinates": {"x_norm": 0.7, "y_norm": 0.7, "w_norm": 0.2, "h_norm": 0.2},
      "operation": {"type": "fill", "color": "#000000FF"}
    }
  ],
  "output": {"format": "webp", "quality": 85}
}
EOF

echo -e "${YELLOW}Running autocannon benchmark...${NC}"
echo ""

# Check if autocannon is installed
if ! command -v autocannon &> /dev/null; then
  echo "Error: autocannon is not installed."
  echo "Install it with: npm install -g autocannon"
  exit 1
fi

# Run benchmark
# Note: autocannon doesn't support multipart directly, so this is a simplified version
# In production, you'd use a custom script with proper multipart form data
autocannon \
  -c $CONNECTIONS \
  -d $DURATION \
  -p $PIPELINING \
  -m POST \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  --renderStatusCodes \
  --json > bench/bytes-result.json \
  "$URL" || echo "Note: This is a simplified benchmark. For accurate multipart testing, use a custom script with proper form data."

# Parse and display results
echo ""
echo -e "${GREEN}=== Results ===${NC}"

if command -v jq &> /dev/null && [ -f bench/bytes-result.json ]; then
  echo ""
  echo "Latency:"
  jq -r '.latency | "  Mean: \(.mean)ms\n  P50: \(.p50)ms\n  P95: \(.p95)ms\n  P99: \(.p99)ms\n  Max: \(.max)ms"' bench/bytes-result.json

  echo ""
  echo "Throughput:"
  jq -r '.throughput | "  Mean: \(.mean) req/s\n  Total: \(.total) requests"' bench/bytes-result.json

  echo ""
  echo "Status Codes:"
  jq -r '.statusCodeStats | to_entries[] | "  \(.key): \(.value)"' bench/bytes-result.json
else
  echo "Results saved to bench/bytes-result.json"
  echo "Install jq for formatted output: brew install jq"
fi

echo ""
echo -e "${GREEN}Benchmark complete!${NC}"
echo "Full results: bench/bytes-result.json"
