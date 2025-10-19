#!/bin/bash

# Easy Base64 Redaction Script
# Usage: ./test-base64-redaction.sh <image-path> [operation] [output-file]

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
IMAGE_PATH="${1:-/tmp/test-image.jpg}"
OPERATION="${2:-blur}"
OUTPUT_FILE="${3:-redacted-output.jpg}"

API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-test-key}"

echo -e "${BLUE}=== Image Redaction Test ===${NC}"
echo ""

# Check if image exists
if [ ! -f "$IMAGE_PATH" ]; then
    echo -e "${YELLOW}Error: Image not found: $IMAGE_PATH${NC}"
    echo "Usage: $0 <image-path> [operation] [output-file]"
    echo ""
    echo "Operations: blur, pixelate, fill"
    exit 1
fi

echo -e "${BLUE}Input:${NC} $IMAGE_PATH"
ls -lh "$IMAGE_PATH"
echo ""

# Encode image to base64
echo -e "${BLUE}Encoding image to base64...${NC}"
IMAGE_BASE64=$(base64 -i "$IMAGE_PATH" | tr -d '\n')
BASE64_SIZE=$(echo -n "$IMAGE_BASE64" | wc -c)
echo "Base64 size: $BASE64_SIZE characters"
echo ""

# Build JSON based on operation
case "$OPERATION" in
    blur)
        echo -e "${BLUE}Operation:${NC} Blur (high strength)"
        JSON_DATA="{
            \"image\": \"$IMAGE_BASE64\",
            \"regions\": [{
                \"type\": \"blur\",
                \"coords\": {\"x\": 100, \"y\": 100, \"width\": 400, \"height\": 300},
                \"strength\": \"high\"
            }],
            \"output\": {\"format\": \"jpeg\", \"quality\": 90}
        }"
        ;;
    pixelate)
        echo -e "${BLUE}Operation:${NC} Pixelate (24px blocks)"
        JSON_DATA="{
            \"image\": \"$IMAGE_BASE64\",
            \"regions\": [{
                \"type\": \"pixelate\",
                \"coords\": {\"x\": 100, \"y\": 100, \"width\": 400, \"height\": 300},
                \"blockSize\": 24
            }],
            \"output\": {\"format\": \"jpeg\", \"quality\": 90}
        }"
        ;;
    fill)
        echo -e "${BLUE}Operation:${NC} Fill with black"
        JSON_DATA="{
            \"image\": \"$IMAGE_BASE64\",
            \"regions\": [{
                \"type\": \"fill\",
                \"coords\": {\"x\": 100, \"y\": 100, \"width\": 400, \"height\": 300},
                \"color\": \"#000000\"
            }],
            \"output\": {\"format\": \"jpeg\", \"quality\": 90}
        }"
        ;;
    multi)
        echo -e "${BLUE}Operation:${NC} Multiple (blur + pixelate + fill)"
        JSON_DATA="{
            \"image\": \"$IMAGE_BASE64\",
            \"regions\": [
                {
                    \"type\": \"blur\",
                    \"coords\": {\"x\": 50, \"y\": 50, \"width\": 200, \"height\": 150},
                    \"strength\": \"high\"
                },
                {
                    \"type\": \"pixelate\",
                    \"coords\": {\"x\": 300, \"y\": 200, \"width\": 200, \"height\": 150},
                    \"blockSize\": 12
                },
                {
                    \"type\": \"fill\",
                    \"coords\": {\"x\": 0, \"y\": 0, \"width\": 150, \"height\": 80},
                    \"color\": \"#FF0000\"
                }
            ],
            \"output\": {\"format\": \"jpeg\", \"quality\": 90}
        }"
        ;;
    *)
        echo -e "${YELLOW}Unknown operation: $OPERATION${NC}"
        echo "Available: blur, pixelate, fill, multi"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}Sending request to $API_URL/v1/redact/base64...${NC}"

# Send request
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT_FILE" \
    -X POST "$API_URL/v1/redact/base64" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$JSON_DATA")

echo ""

# Check result
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Success! (HTTP $HTTP_CODE)${NC}"
    echo ""
    echo -e "${BLUE}Output:${NC} $OUTPUT_FILE"
    ls -lh "$OUTPUT_FILE"
    file "$OUTPUT_FILE"
    echo ""

    # Try to open the file
    if [[ "$OSTYPE" == "darwin"* ]] && command -v open &> /dev/null; then
        echo -e "${BLUE}Opening image...${NC}"
        open "$OUTPUT_FILE"
    fi
else
    echo -e "${YELLOW}✗ Failed (HTTP $HTTP_CODE)${NC}"
    echo ""
    echo "Response:"
    cat "$OUTPUT_FILE"
    echo ""
    exit 1
fi

echo -e "${GREEN}=== Done! ===${NC}"
