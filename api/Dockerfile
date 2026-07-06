# ─── Build stage ──────────────────────────────────────────────
FROM golang:1.24-alpine AS build
WORKDIR /src

# Cache deps
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -buildmode=exe -o /out/server ./cmd/server

# ─── Runtime stage ────────────────────────────────────────────
FROM alpine:3.20
WORKDIR /app

# TLS roots (outbound HTTPS: AI provider, AWS, Google OAuth) + timezone data
RUN apk add --no-cache ca-certificates tzdata

COPY --from=build /out/server /app/server

EXPOSE 8080
ENV PORT=8080
CMD ["/app/server"]
