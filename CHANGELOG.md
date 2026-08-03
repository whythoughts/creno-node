# Changelog

All notable changes to `@creno/node` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/).

## [0.1.1] - 2026-08-03

### Changed
- Reworded the README with fewer hyphenated compounds. No API or behaviour
  change; this release exists so the npm page picks the new text up, since
  npmjs.com renders the README from the published tarball.

## [0.1.0] - 2026-08-03

### Added
- Initial release: `CrenoClient` with `listServiceTypes`, `getAvailability`,
  `createBooking`.
- Typed error class per API error code (`CrenoConflictError`,
  `CrenoPlanLimitError`, `CrenoRateLimitError`, `CrenoValidationError`,
  `CrenoNotFoundError`, `CrenoForbiddenError`, `CrenoAuthenticationError`,
  `CrenoAPIError`), matching the Python client's exceptions exactly.
- Zero runtime dependencies, built on Node 18+'s native `fetch`.
- Dual ESM + CommonJS build, so `import` and `require` both work, each with
  its own type declarations resolved via the `exports` map.
- Automatic retry (exponential backoff) on the two endpoints that only read,
  for network errors or 5xx responses. `createBooking` is never retried
  automatically.
