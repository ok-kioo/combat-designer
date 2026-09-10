import { describe, it, expect, beforeEach } from "vitest";
import http from "node:http";
import { ApiServer } from "../../../src/infrastructure/http/server.js";

describe("API Server Operational Endpoints", () => {
  let server: ApiServer;

  beforeEach(() => {
    server = new ApiServer({
      port: 3099,
      operationalSecret: "test-ops-secret",
    });
  });

  async function makeRequest(
    method: string,
    url: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    const req = {
      method,
      url,
      headers,
    } as http.IncomingMessage;

    let statusCode = 200;
    let responseBody = "";
    const responseHeaders: Record<string, string> = {};

    const res = {
      writeHead: (code: number, hdrs?: Record<string, string>) => {
        statusCode = code;
        if (hdrs) Object.assign(responseHeaders, hdrs);
      },
      end: (chunk?: string) => {
        if (chunk) responseBody += chunk;
      },
      getHeaders: () => responseHeaders,
    } as unknown as http.ServerResponse;

    await server.handleRequest(req, res);
    return { status: statusCode, body: responseBody, headers: responseHeaders };
  }

  it("GET /health/live returns 200 LIVE", async () => {
    const res = await makeRequest("GET", "/health/live");
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe("LIVE");
  });

  it("GET /health returns 200 LIVE for Docker Compose spider", async () => {
    const res = await makeRequest("GET", "/health");
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe("LIVE");
  });

  it("GET /health/ready returns 200 READY", async () => {
    const res = await makeRequest("GET", "/health/ready");
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe("READY");
  });

  it("GET /health/dependencies denies unauthenticated requests with 403", async () => {
    const res = await makeRequest("GET", "/health/dependencies");
    expect(res.status).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("FORBIDDEN");
  });

  it("GET /health/dependencies allows authorized requests with sanitized report", async () => {
    const res = await makeRequest("GET", "/health/dependencies", {
      "x-internal-secret": "test-ops-secret",
    });
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe("READY");
    expect(parsed.components.api.status).toBe("LIVE");
    expect(parsed.components.postgres.status).toBe("READY");
    expect(parsed.components.neo4j.status).toBe("READY");
    expect(parsed.components.mcp.status).toBe("READY");
  });

  it("GET /metrics denies unauthenticated requests with 403", async () => {
    const res = await makeRequest("GET", "/metrics");
    expect(res.status).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("FORBIDDEN");
  });

  it("GET /metrics allows authorized requests in Prometheus format", async () => {
    const res = await makeRequest("GET", "/metrics", {
      authorization: "Bearer test-ops-secret",
    });
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/plain");
    expect(res.body).toContain("# HELP");
  });

  it("GET /unknown returns 404 NOT_FOUND", async () => {
    const res = await makeRequest("GET", "/unknown_route");
    expect(res.status).toBe(404);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("NOT_FOUND");
  });

  it("operational endpoints reject product API callers sending standard user tokens", async () => {
    const res = await makeRequest("GET", "/metrics", {
      authorization: "Bearer product-user-jwt-token-12345",
      "sec-fetch-dest": "empty",
    });
    expect(res.status).toBe(403);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("FORBIDDEN");
  });

  it("operational endpoints allow access via x-operational-secret header", async () => {
    const res = await makeRequest("GET", "/metrics", {
      "x-operational-secret": "test-ops-secret",
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain("# HELP");
  });

  it("strictOperationalIsolation blocks unauthenticated health probes", async () => {
    const strictServer = new ApiServer({
      operationalSecret: "test-ops-secret",
      strictOperationalIsolation: true,
    });
    const req = {
      method: "GET",
      url: "/health/live",
      headers: {},
    } as http.IncomingMessage;
    let statusCode = 200;
    let body = "";
    const res = {
      writeHead: (code: number) => { statusCode = code; },
      end: (c?: string) => { if (c) body += c; },
      getHeaders: () => ({}),
    } as unknown as http.ServerResponse;

    await strictServer.handleRequest(req, res);
    expect(statusCode).toBe(403);
    expect(body).toContain("FORBIDDEN");
  });
});
