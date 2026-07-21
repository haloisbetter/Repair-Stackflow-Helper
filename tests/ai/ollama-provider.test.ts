import { describe, it, expect } from "vitest";
import { OllamaProvider } from "../../src/ai/ollama-provider.js";

function mockFetch(res: Response | Error, delayMs = 0): typeof fetch {
  return (async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
}

describe("ollama provider health", () => {
  it("reports available when /api/tags responds", async () => {
    const fetchImpl = mockFetch(new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const p = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const h = await p.healthCheck();
    expect(h.status).toBe("available");
    expect(h.models).toContain("llama3.2:latest");
  });

  it("detects approved model presence", async () => {
    const fetchImpl = mockFetch(new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const p = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const avail = await p.checkModel("llama3.2");
    expect(avail.available).toBe(true);
  });

  it("reports misconfigured on HTTP error", async () => {
    const fetchImpl = mockFetch(new Response("nope", { status: 500 }));
    const p = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const h = await p.healthCheck();
    expect(h.status).toBe("misconfigured");
  });

  it("reports unavailable on network error", async () => {
    const fetchImpl = mockFetch(new Error("ECONNREFUSED"));
    const p = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", fetchImpl });
    const h = await p.healthCheck();
    expect(h.status).toBe("unavailable");
  });
});
