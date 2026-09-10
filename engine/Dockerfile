# Multi-stage Dockerfile for Pure Deterministic Rust Combat Engine
FROM rust:alpine AS builder
RUN apk add --no-cache musl-dev

WORKDIR /app
COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release --bin server

FROM alpine:latest
RUN apk add --no-cache wget

WORKDIR /app
COPY --from=builder /app/target/release/server /app/combat-engine

ENV PORT=3003
EXPOSE 3003

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3003/health || exit 1

CMD ["/app/combat-engine"]
