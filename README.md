# @creno/node

Official Node.js/TypeScript client for [Créno](https://crenoapp.com)'s
scheduling and booking API. Zero runtime dependencies, built on Node
18+'s native `fetch`.

For a browser widget, see [`@creno/react`](https://github.com/whythoughts/creno-react) or
[`@creno/vue`](https://github.com/whythoughts/creno-vue) instead. This package is for calling the API from
your own backend.

## Install

```bash
npm install @creno/node
```

## Quickstart

```ts
import { CrenoClient } from "@creno/node";

const client = new CrenoClient("pk_live_...");

const availability = await client.getAvailability({ from: "2026-08-01", to: "2026-08-07" });

const booking = await client.createBooking({
  startAt: availability.slots[0].startAt,
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
});
```

## Authentication

The API key is the same publishable key used by Creno's browser widgets.
In the browser, safety comes from Creno's origin allowlist, not from
keeping the key secret, but this client makes server-to-server calls
with no `Origin` header, so that check never applies here. Treat the key
as sensitive in your own backend (env var, secrets manager, not
committed to source control).

## Error handling

Every non-2xx response raises a specific error class instead of a
generic one, so you can catch exactly the failure you care about:

```ts
import { CrenoConflictError, CrenoPlanLimitError } from "@creno/node";

try {
  await client.createBooking({ /* ... */ });
} catch (err) {
  if (err instanceof CrenoConflictError) {
    // that slot was just taken, re-fetch availability and retry
  } else if (err instanceof CrenoPlanLimitError) {
    // err.limitType, err.plan
  } else {
    throw err;
  }
}
```

| Class | HTTP status |
|---|---|
| `CrenoAuthenticationError` | 401 |
| `CrenoForbiddenError` | 403 |
| `CrenoNotFoundError` | 404 |
| `CrenoValidationError` | 400 |
| `CrenoConflictError` | 409 |
| `CrenoPlanLimitError` | 402 (has `.limitType` and `.plan`) |
| `CrenoRateLimitError` | 429 |
| `CrenoAPIError` | network errors, 5xx, anything else |

All of the above extend `CrenoError` (`.statusCode`, `.responseBody`).

This matches the [Python client](https://github.com/whythoughts/creno-python)'s exception taxonomy
one-for-one, the same failure means the same thing to catch, in either
language.

## Retries

`listServiceTypes` and `getAvailability` (read-only, safe to repeat) are
retried up to 3 times with exponential backoff on a network error or a
5xx response. `createBooking` is never retried automatically: a lost
response after the booking was actually created server-side, followed by
a client-side retry, could submit a second real booking to a real
customer, even though Creno's own database can never double-book the
same slot.

## License

[MIT](./LICENSE). See [CHANGELOG.md](./CHANGELOG.md) for release history and [SECURITY.md](./SECURITY.md) to report a vulnerability.

---

Made by [Solution Lancée](https://solutionlancee.com).
