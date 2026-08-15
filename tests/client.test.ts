import { describe, expect, it, vi } from "vitest";
import { CrenoClient } from "../src/client.js";
import {
  CrenoConflictError,
  CrenoForbiddenError,
  CrenoPlanLimitError,
  CrenoTenantSuspendedError,
  CrenoRateLimitError,
  CrenoValidationError,
} from "../src/errors.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function clientWith(fetchImpl: typeof fetch) {
  return new CrenoClient("pk_live_test", { fetch: fetchImpl });
}

describe("CrenoClient", () => {
  it("sends the API key and client-library headers", async () => {
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      expect(headers["X-API-Key"]).toBe("pk_live_test");
      expect(headers["X-Client-Library"]).toBe("node");
      return jsonResponse(200, []);
    });
    await clientWith(fetchMock as unknown as typeof fetch).listServiceTypes();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("parses service types", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, [{ id: "1", resourceId: "r1", name: "Haircut", active: true, sortOrder: 0 }]),
    );
    const result = await clientWith(fetchMock as unknown as typeof fetch).listServiceTypes();
    expect(result).toEqual([{ id: "1", resourceId: "r1", name: "Haircut", active: true, sortOrder: 0 }]);
  });

  it("parses availability", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        resourceId: "r1",
        timezone: "America/Toronto",
        slots: [{ startAt: "2026-08-03T13:00:00.000Z", endAt: "2026-08-03T13:30:00.000Z" }],
      }),
    );
    const result = await clientWith(fetchMock as unknown as typeof fetch).getAvailability({
      from: "2026-08-01",
      to: "2026-08-07",
    });
    expect(result.slots).toHaveLength(1);
    expect(result.timezone).toBe("America/Toronto");
  });

  it("omits undefined fields from the booking request body", async () => {
    let sentBody: unknown;
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string);
      return jsonResponse(201, { id: "b1" });
    });
    await clientWith(fetchMock as unknown as typeof fetch).createBooking({
      startAt: "2026-08-03T13:00:00.000Z",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
    });
    expect(sentBody).toEqual({
      startAt: "2026-08-03T13:00:00.000Z",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
    });
  });

  it.each([
    [409, CrenoConflictError],
    [429, CrenoRateLimitError],
    [400, CrenoValidationError],
  ])("maps %i responses to the right exception class", async (status, ExpectedError) => {
    const fetchMock = vi.fn(async () => jsonResponse(status, { error: "nope" }));
    await expect(clientWith(fetchMock as unknown as typeof fetch).listServiceTypes()).rejects.toBeInstanceOf(
      ExpectedError,
    );
  });

  it("carries limitType and plan on a plan-limit error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(402, { error: "limit reached", limitType: "bookingsPerMonth", plan: "starter" }));
    try {
      await clientWith(fetchMock as unknown as typeof fetch).listServiceTypes();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CrenoPlanLimitError);
      expect((err as CrenoPlanLimitError).limitType).toBe("bookingsPerMonth");
      expect((err as CrenoPlanLimitError).plan).toBe("starter");
    }
  });

  it("retries a GET on 500 then succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls < 2) return jsonResponse(500, { error: "boom" });
      return jsonResponse(200, []);
    });
    const result = await clientWith(fetchMock as unknown as typeof fetch).listServiceTypes();
    expect(result).toEqual([]);
    expect(calls).toBe(2);
  });

  it("does not retry a GET on a 4xx", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return jsonResponse(404, { error: "not found" });
    });
    await expect(clientWith(fetchMock as unknown as typeof fetch).listServiceTypes()).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("never retries createBooking, even on 500", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return jsonResponse(500, { error: "boom" });
    });
    await expect(
      clientWith(fetchMock as unknown as typeof fetch).createBooking({
        startAt: "2026-08-03T13:00:00.000Z",
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

// A suspended tenant and a disallowed origin both answer 403, and a
// server-to-server caller has to be able to tell them apart: one is a
// configuration mistake, the other is the business being switched off, which
// no amount of retrying fixes.
describe("suspended tenants", () => {
  function clientFor(body: unknown) {
    return clientWith((async () => jsonResponse(403, body)) as unknown as typeof fetch);
  }

  it("raises CrenoTenantSuspendedError when the body says so", async () => {
    await expect(clientFor({ error: "nope", code: "tenant_suspended" }).listServiceTypes()).rejects.toBeInstanceOf(
      CrenoTenantSuspendedError,
    );
  });

  it("is still a CrenoForbiddenError, so existing handlers are unaffected", async () => {
    await expect(clientFor({ error: "nope", code: "tenant_suspended" }).listServiceTypes()).rejects.toBeInstanceOf(
      CrenoForbiddenError,
    );
  });

  it("leaves an origin 403 as the plain forbidden error", async () => {
    await expect(
      clientFor({ error: "Origin not allowed for this tenant", code: "origin_not_allowed" }).listServiceTypes(),
    ).rejects.not.toBeInstanceOf(CrenoTenantSuspendedError);
  });

  it("does not sniff the message when there is no code", async () => {
    await expect(clientFor({ error: "This business is suspended." }).listServiceTypes()).rejects.not.toBeInstanceOf(
      CrenoTenantSuspendedError,
    );
  });

  // 4xx is not retried, and a suspension least of all: the answer will be the
  // same every time and each attempt is another request against a tenant that
  // has been switched off.
  it("is not retried", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(403, { error: "nope", code: "tenant_suspended" }));
    await expect(
      clientWith(fetchMock as unknown as typeof fetch).listServiceTypes(),
    ).rejects.toBeInstanceOf(CrenoTenantSuspendedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
