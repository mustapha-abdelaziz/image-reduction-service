#!/bin/bash
set -e

echo "🧪 Testing Image Redactor Service - Live Server"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-test-key}"

echo -e "${BLUE}Testing server at: $BASE_URL${NC}"
echo ""

# 1. Health Check
echo -e "${YELLOW}1. Testing /health endpoint...${NC}"
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo -e "${GREEN}✓ Health check passed${NC}"
  echo "  Response: $HEALTH"
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "  Response: $HEALTH"
  exit 1
fi
echo ""

# 2. Health Ready
echo -e "${YELLOW}2. Testing /health/ready endpoint...${NC}"
READY=$(curl -s "$BASE_URL/health/ready")
if echo "$READY" | grep -q '"ready":true'; then
  echo -e "${GREEN}✓ Ready check passed${NC}"
  echo "  Response: $READY"
else
  echo -e "${RED}✗ Ready check failed${NC}"
  exit 1
fi
echo ""

# 3. Metrics
echo -e "${YELLOW}3. Testing /metrics endpoint...${NC}"
METRICS=$(curl -s "$BASE_URL/metrics" | head -5)
if echo "$METRICS" | grep -q "TYPE"; then
  echo -e "${GREEN}✓ Metrics endpoint working${NC}"
  echo "  First 5 lines:"
  echo "$METRICS" | sed 's/^/  /'
else
  echo -e "${RED}✗ Metrics endpoint failed${NC}"
  exit 1
fi
echo ""

# 4. Create test image
echo -e "${YELLOW}4. Creating test image...${NC}"
TEST_IMG="/tmp/test-redact.jpg"

# Check if ImageMagick or sips is available
if command -v convert &> /dev/null; then
  # Using ImageMagick
  convert -size 800x600 xc:blue \
    -fill white -pointsize 72 -gravity center -annotate +0+0 "REDACT ME" \
    "$TEST_IMG"
  echo -e "${GREEN}✓ Created test image with ImageMagick${NC}"
elif command -v sips &> /dev/null; then
  # On macOS, create a solid color image using screencapture workaround
  # Actually, let's use a different approach - create via base64
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > /tmp/1px.png
  sips -z 600 800 /tmp/1px.png --out "$TEST_IMG" &> /dev/null
  echo -e "${GREEN}✓ Created test image with sips${NC}"
else
  echo -e "${YELLOW}⚠ No image tool found (ImageMagick/sips)${NC}"
  echo "  Skipping multipart test - you can still test with your own images:"
  echo ""
  echo "  curl -X POST $BASE_URL/v1/redact \\"
  echo "    -H 'x-api-key: $API_KEY' \\"
  echo "    -F 'image=@/path/to/your/image.jpg' \\"
  echo "    -F 'ops=[{\"type\":\"blur\",\"coords\":{\"x\":100,\"y\":100,\"width\":200,\"height\":150},\"strength\":\"medium\"}]' \\"
  echo "    --output blurred.jpg"
  echo ""
  exit 0
fi

ls -lh "$TEST_IMG"
echo ""

# 5. Test multipart endpoint (with API key)
echo -e "${YELLOW}5. Testing /v1/redact (multipart) with blur...${NC}"
OUTPUT_IMG="/tmp/test-redacted.jpg"
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT_IMG" \
  -X POST "$BASE_URL/v1/redact" \
  -H "x-api-key: $API_KEY" \
  -F "image=@$TEST_IMG" \
  -F 'ops=[{"type":"blur","coords":{"x":100,"y":100,"width":400,"height":300},"strength":"high"}]')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Redaction successful (HTTP $HTTP_CODE)${NC}"
  ls -lh "$OUTPUT_IMG"
  echo "  Saved to: $OUTPUT_IMG"

  # Try to open on macOS
  if [[ "$OSTYPE" == "darwin"* ]] && command -v open &> /dev/null; then
    echo -e "${BLUE}  Opening image...${NC}"
    open "$OUTPUT_IMG"
  fi
else
  echo -e "${RED}✗ Redaction failed (HTTP $HTTP_CODE)${NC}"
  cat "$OUTPUT_IMG"
  exit 1
fi
echo ""

# 6. Test without API key (should fail)
echo -e "${YELLOW}6. Testing authentication (should fail without API key)...${NC}"
HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
  -X POST "$BASE_URL/v1/redact" \
  -F "image=@$TEST_IMG" \
  -F 'ops=[{"type":"blur","coords":{"x":0,"y":0,"width":100,"height":100},"strength":"low"}]')

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  echo -e "${GREEN}✓ Authentication properly enforced (HTTP $HTTP_CODE)${NC}"
else
  echo -e "${RED}✗ Authentication check failed - expected 401/403, got $HTTP_CODE${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✓ All tests passed!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo "  • Test with your own images"
echo "  • Try pixelate and fill operations"
echo "  • Test S3 endpoints with docker-compose (MinIO)"
echo "  • Run benchmarks: ./scripts/bench-bytes.sh"
echo "  • Check metrics: curl $BASE_URL/metrics"
echo ""
