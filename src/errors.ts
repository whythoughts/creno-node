// Mirrors packages/python-sdk/src/creno/exceptions.py's taxonomy one-for-one
// (naming/casing adapted to JS convention), the point is that catching a
// specific failure looks and feels the same regardless of which language
// you're integrating from.

export class CrenoError extends Error {
  /** null for errors that never got an HTTP response at all (a network failure). */
  statusCode: number | null;
  responseBody: unknown;

  constructor(message: string, opts: { statusCode?: number | null; responseBody?: unknown } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = opts.statusCode ?? null;
    this.responseBody = opts.responseBody ?? null;
  }
}

/** 401 - the X-API-Key header was missing or didn't match a real key. */
export class CrenoAuthenticationError extends CrenoError {}

/**
 * 403 - the request's Origin header isn't on the tenant's allowlist. This
 * client never sends an Origin header, so this shouldn't occur during
 * normal server-to-server use of this SDK.
 *
 * A suspended tenant also answers 403, as the subclass below. Catching this
 * one still catches both.
 */
export class CrenoForbiddenError extends CrenoError {}

/**
 * 403 with `code: "tenant_suspended"` - the business has been suspended and is
 * not accepting bookings. Unlike the origin case above, this one *is* reachable
 * from normal server-to-server use, and retrying will not help: the suspension
 * is deliberate and only Créno can lift it.
 *
 * A subclass, so existing code catching CrenoForbiddenError is unaffected.
 */
export class CrenoTenantSuspendedError extends CrenoForbiddenError {}

/** 404 - no matching resource, or no scheduling resource configured for this tenant. */
export class CrenoNotFoundError extends CrenoError {}

/** 400 - the request body failed validation (for example, a Turnstile challenge). */
export class CrenoValidationError extends CrenoError {}

/** 409 - the requested time slot is no longer available. */
export class CrenoConflictError extends CrenoError {}

/** 402 - the tenant's plan limit has been reached. */
export class CrenoPlanLimitError extends CrenoError {
  limitType: string | null;
  plan: string | null;

  constructor(
    message: string,
    opts: { statusCode: number; responseBody: unknown; limitType: string | null; plan: string | null },
  ) {
    super(message, opts);
    this.limitType = opts.limitType;
    this.plan = opts.plan;
  }
}

/** 429 - too many requests. Rate limits are keyed per API key, not per IP. */
export class CrenoRateLimitError extends CrenoError {}

/** Fallback for network errors, 5xx responses, or any other unexpected response. */
export class CrenoAPIError extends CrenoError {}
