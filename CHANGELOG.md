# Changelog

All notable changes to `@creno/node` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [0.1.0] - 2026-07-28

### Added
- Initial release: `CrenoClient` with `listServiceTypes`, `getAvailability`,
  `createBooking`.
- Typed error class per API error code (`CrenoConflictError`,
  `CrenoPlanLimitError`, `CrenoRateLimitError`, `CrenoValidationError`,
  `CrenoNotFoundError`, `CrenoForbiddenError`, `CrenoAuthenticationError`,
  `CrenoAPIError`), matching the Python client's taxonomy one-for-one.
- Zero runtime dependencies, built on Node 18+'s native `fetch`.
- Automatic retry (exponential backoff) on the two read-only endpoints for
  network errors or 5xx responses; `createBooking` is never auto-retried.
