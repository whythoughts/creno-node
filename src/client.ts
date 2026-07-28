import {
  CrenoAPIError,
  CrenoAuthenticationError,
  CrenoConflictError,
  CrenoError,
  CrenoForbiddenError,
  CrenoNotFoundError,
  CrenoPlanLimitError,
  CrenoRateLimitError,
  CrenoValidationError,
} from "./errors.js";
import type {
  Availability,
  Booking,
  CreateBookingInput,
  GetAvailabilityInput,
  ListServiceTypesInput,
  ServiceType,
} from "./types.js";
import { VERSION } from "./version.js";

const DEFAULT_BASE_URL = "https://api.crenoapp.com";
const DEFAULT_TIMEOUT_MS = 10_000;

// Only applied to the two read-only GET endpoints, never to createBooking
// (see its doc comment for why).
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;

function dropUndefined<T extends Record<string, unknown>>(values: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CrenoClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  /** Swap in a custom fetch (e.g. for tests). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Client for Creno's public scheduling and booking API.
 *
 * The API key you pass here is the same "publishable" key used by Creno's
 * browser widgets. In the browser, safety comes from Creno's origin
 * allowlist, not from keeping the key secret. This client makes
 * server-to-server calls with no Origin header, so that allowlist check
 * never applies here, treat the key as sensitive in your own backend.
 */
export class CrenoClient {
  #apiKey: string;
  #baseUrl: string;
  #timeoutMs: number;
  #fetch: typeof fetch;

  constructor(apiKey: string, options: CrenoClientOptions = {}) {
    if (!apiKey) throw new Error("apiKey is required");
    this.#apiKey = apiKey;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetch ?? fetch;
  }

  /** GET /v1/public/service-types. Retries on network errors or 5xx. */
  async listServiceTypes(input: ListServiceTypesInput = {}): Promise<ServiceType[]> {
    const params = dropUndefined({ resourceId: input.resourceId });
    return this.#requestIdempotent("GET", "/v1/public/service-types", params);
  }

  /** GET /v1/public/availability. Retries on network errors or 5xx. */
  async getAvailability(input: GetAvailabilityInput): Promise<Availability> {
    const params = dropUndefined({
      from: input.from,
      to: input.to,
      resourceId: input.resourceId,
      serviceTypeId: input.serviceTypeId,
    });
    return this.#requestIdempotent("GET", "/v1/public/availability", params);
  }

  /**
   * POST /v1/public/bookings.
   *
   * Never retried automatically: a lost response after the booking was
   * actually created server-side, followed by a client-side retry, could
   * still submit a second real booking attempt to a real customer, even
   * though Creno's own database can never double-book the same slot.
   */
  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const body = dropUndefined({
      resourceId: input.resourceId,
      serviceTypeId: input.serviceTypeId,
      startAt: input.startAt,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      notes: input.notes,
      lang: input.lang,
      turnstileToken: input.turnstileToken,
    });
    return this.#request("POST", "/v1/public/bookings", { body });
  }

  // -- internals -------------------------------------------------------------

  async #requestIdempotent<T>(method: string, path: string, params: Record<string, unknown>): Promise<T> {
    let lastError: CrenoError | undefined;
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.#request<T>(method, path, { params });
      } catch (err) {
        if (!(err instanceof CrenoError)) throw err;
        const retryable = err.statusCode === null || err.statusCode >= 500;
        if (!retryable || attempt === MAX_RETRY_ATTEMPTS - 1) throw err;
        lastError = err;
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
    throw lastError; // pragma: no cover - loop always returns or throws
  }

  async #request<T>(
    method: string,
    path: string,
    opts: { params?: Record<string, unknown>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const url = new URL(this.#baseUrl + path);
    for (const [key, value] of Object.entries(opts.params ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: {
          "X-API-Key": this.#apiKey,
          "X-Client-Library": "node",
          "User-Agent": `creno-node/${VERSION}`,
          "Content-Type": "application/json",
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new CrenoAPIError(`Network error calling the Creno API: ${(err as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 200 && response.status < 300) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // non-JSON error body, fall through, message stays generic
    }
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : undefined) ?? response.statusText;

    switch (response.status) {
      case 401:
        throw new CrenoAuthenticationError(message, { statusCode: 401, responseBody: body });
      case 403:
        throw new CrenoForbiddenError(message, { statusCode: 403, responseBody: body });
      case 404:
        throw new CrenoNotFoundError(message, { statusCode: 404, responseBody: body });
      case 400:
        throw new CrenoValidationError(message, { statusCode: 400, responseBody: body });
      case 409:
        throw new CrenoConflictError(message, { statusCode: 409, responseBody: body });
      case 402: {
        const b = body as { limitType?: string; plan?: string } | null;
        throw new CrenoPlanLimitError(message, {
          statusCode: 402,
          responseBody: body,
          limitType: b?.limitType ?? null,
          plan: b?.plan ?? null,
        });
      }
      case 429:
        throw new CrenoRateLimitError(message, { statusCode: 429, responseBody: body });
      default:
        throw new CrenoAPIError(message, { statusCode: response.status, responseBody: body });
    }
  }
}
