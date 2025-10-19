# Image Redactor Service

A production-ready Node.js microservice for high-throughput image redaction with blur, pixelation, and fill operations. Built for scale, observability, and cloud-native deployment.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)

## Why This Stack?

- **Performance**: Sharp/libvips for hardware-accelerated image ops; Fastify for high-throughput HTTP
- **Type Safety**: TypeScript strict mode + Zod runtime validation = zero runtime surprises
- **Observability**: Prometheus metrics, OpenTelemetry trace IDs, structured logging
- **Cloud-Native**: Streaming S3 I/O, Docker-ready, Kubernetes health probes
- **Production-Ready**: Rate limiting, idempotency, deterministic outputs, comprehensive error taxonomy

## Features

### Core Operations
- **Blur**: Small/Medium/Large (σ=3/6/12)
- **Pixelate**: Block sizes 6/12/24px
- **Fill**: Solid color with optional alpha (#RRGGBB or #RRGGBBAA)

### Input/Output
- **Formats**: PNG, JPEG, WebP input → WebP/JPEG output
- **Limits**: ≤10MB file size, ≤3840×2160 resolution, ≤20 regions per request
- **Coordinates**: Pixel-based or normalized [0..1] units

### API Endpoints
- `POST /v1/redact` - Multipart file upload
- `POST /v1/redact/s3` - S3-to-S3 streaming (idempotent)
- `POST /v1/redact/batch` - Batch processing (≤10 items) with webhook callback
- `GET /v1/redact/batch/:jobId` - Job status polling
- `GET /health` - Health check with Sharp/encoder verification
- `GET /metrics` - Prometheus metrics

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Client    │─────>│   Fastify    │─────>│    Sharp    │
│             │<─────│   (HTTP)     │<─────│  (libvips)  │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ├──> Security (API Key)
                            ├──> Rate Limiter (60 req/min)
                            ├──> Multipart Parser
                            ├──> Metrics (prom-client)
                            └──> Tracing (OpenTelemetry)
                            
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│     S3      │<────>│  S3 Service  │      │   Webhook   │
│   Storage   │      │  (Streaming) │─────>│  Callbacks  │
└─────────────┘      └──────────────┘      └─────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm (recommended) or npm

### Installation

```bash
# Clone repository
git clone https://github.com/yourname/image-redactor-service.git
cd image-redactor-service

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start development server
npm run dev
```

### 🧪 Testing with Postman

**Fastest way to test the API!**

1. Import `postman-collection.json` into Postman
2. Send the "Health Check" request
3. Explore all 12 pre-configured endpoints

See [`POSTMAN_QUICKSTART.md`](./POSTMAN_QUICKSTART.md) for details.

### Docker

```bash
# Build image
docker build -t image-redactor-service .

# Run container
docker run -p 3000:3000 --env-file .env image-redactor-service

# Or use docker-compose
docker-compose up
```

## API Examples

### 1. Multipart Upload with Blur

```bash
curl -X POST http://localhost:3000/v1/redact \
  -H "x-api-key: dev-123" \
  -F "file=@sensitive.jpg" \
  -F 'ops={
    "regions": [
      {
        "coordinates": {"x": 100, "y": 100, "width": 200, "height": 150},
        "operation": {"type": "blur", "size": "L"}
      }
    ],
    "output": {"format": "webp", "quality": 85}
  }' \
  --output redacted.webp
```

### 2. S3-to-S3 Redaction

```bash
curl -X POST http://localhost:3000/v1/redact/s3 \
  -H "x-api-key: dev-123" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "bucket": "my-input-bucket",
      "key": "images/sensitive.png"
    },
    "output": {
      "bucket": "my-output-bucket",
      "key": "redacted/safe.webp",
      "format": "webp",
      "quality": 90
    },
    "regions": [
      {
        "coordinates": {"x_norm": 0.1, "y_norm": 0.2, "w_norm": 0.3, "h_norm": 0.4},
        "operation": {"type": "pixelate", "size": "M"}
      }
    ],
    "idempotency_key": "unique-request-id-12345"
  }'
```

### 3. Batch Processing with Webhook

```bash
curl -X POST http://localhost:3000/v1/redact/batch \
  -H "x-api-key: dev-123" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "input": {"bucket": "input", "key": "image1.jpg"},
        "output": {"bucket": "output", "key": "image1-redacted.webp", "format": "webp"},
        "regions": [{"coordinates": {"x": 0, "y": 0, "width": 100, "height": 100}, "operation": {"type": "fill", "color": "#000000"}}]
      },
      {
        "input": {"bucket": "input", "key": "image2.jpg"},
        "output": {"bucket": "output", "key": "image2-redacted.webp", "format": "webp"},
        "regions": [{"coordinates": {"x_norm": 0.5, "y_norm": 0.5, "w_norm": 0.2, "h_norm": 0.2}, "operation": {"type": "blur", "size": "M"}}]
      }
    ],
    "webhook_url": "https://your-app.com/webhook/batch-complete"
  }'

# Response:
# {
#   "job_id": "abc123def456",
#   "items_count": 2,
#   "estimated_completion_ms": 1000
# }

# Poll status:
curl http://localhost:3000/v1/redact/batch/abc123def456 \
  -H "x-api-key: dev-123"
```

## SLO Targets

| Scenario                          | P95 Latency | Notes                          |
|-----------------------------------|-------------|--------------------------------|
| 1080p, 3 regions (bytes in/out)   | < 120ms     | Multipart upload → stream back |
| 1080p, S3→process→S3             | < 450ms     | Includes network I/O           |
| Memory (RSS)                      | < 200MB     | Under load                     |

## Benchmarking

Run included benchmark scripts to measure performance:

```bash
# Multipart endpoint (autocannon)
npm run bench:bytes

# S3 endpoint (custom script)
npm run bench:s3
```

Benchmark outputs are saved to `bench/` directory.

## Security & Privacy

- **API Key Authentication**: Header-based (`x-api-key`). Placeholder for HMAC/JWT.
- **MIME Sniffing**: File-type validation prevents content-type spoofing
- **Input Limits**: Size, dimensions, region count enforced
- **No Persistence**: Images processed in-memory; S3 outputs only
- **Rate Limiting**: 60 requests/minute per API key
- **Idempotency**: S3 requests support idempotency keys

## Determinism & Caching

- Same input + regions + options → same output hash
- ETag header contains SHA256 of output
- Enables aggressive caching and integrity verification

## Observability

### Metrics (`/metrics`)
- Request duration histogram
- Counter: total requests, errors by type
- Summary: P50/P95/P99 latencies
- Gauge: Memory usage, active connections

### Tracing
- Every request gets a unique `X-Trace-Id` header
- Logs include trace IDs for correlation
- OpenTelemetry span hooks (placeholder for full integration)

### Error Taxonomy

All errors follow this schema:
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Human-readable description",
  "traceId": "abc123",
  "details": {}
}
```

**Error Codes:**
- `VALIDATION_ERROR` (400)
- `LIMIT_EXCEEDED` (413)
- `UNSUPPORTED_MEDIA` (415)
- `S3_ERROR` (40x/50x)
- `PIPELINE_ERROR` (500)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)

## Development

```bash
# Install dependencies
npm install

# Run in watch mode
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Tests
npm test
npm run test:watch
npm run test:coverage

# Build for production
npm run build

# Start production build
npm start
```

## Deployment

### Environment Variables

See [.env.example](./.env.example) for all configuration options.

Required for S3 endpoints:
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT` (optional, for MinIO/DigitalOcean Spaces)

### Kubernetes

Health probes:
- Liveness: `GET /health/live`
- Readiness: `GET /health/ready`

Example probe configuration:
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

## Roadmap

- [ ] Polygon/freeform masks (beyond rectangles)
- [ ] GPU acceleration (Sharp GPU backend)
- [ ] Async face/text detection integration (AWS Rekognition, Azure CV)
- [ ] Redis-backed job store for multi-instance batch processing
- [ ] Full OpenTelemetry distributed tracing
- [ ] gRPC API for microservice-to-microservice communication

## License

MIT © 2024

## Contributing

PRs welcome! Please ensure:
1. TypeScript strict mode compliance
2. Tests for new features
3. Updated documentation
4. Linting passes (`npm run lint`)

---

**Built with ❤️ for production workloads**
