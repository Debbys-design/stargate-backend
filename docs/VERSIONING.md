# Versioning Policy

Stargate Backend follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## Version format

```
MAJOR.MINOR.PATCH
```

| Segment | Increment when |
|---------|----------------|
| `MAJOR` | A public API or contract change is **breaking** — removed endpoints, changed required fields, altered auth flows, renamed webhook event types. |
| `MINOR` | New **backwards-compatible** functionality is added — new endpoints, optional request fields, new webhook events, new feature flags. |
| `PATCH` | **Backwards-compatible bug fixes** — incorrect behaviour corrected, performance improvements, documentation-only changes, dependency security patches. |

Pre-1.0 (`0.y.z`) work is treated as unstable; any minor version may contain breaking changes.

## Release process

1. **Branch** — feature work lands on `main` via pull request.
2. **Changelog** — all user-visible changes are recorded in `CHANGELOG.md` under `[Unreleased]` as they merge.
3. **Version bump** — when cutting a release, move the `[Unreleased]` block to a dated section, bump `version` in [package.json](../package.json), and create an annotated git tag:
   ```sh
   git tag -a v1.2.0 -m "chore: release v1.2.0"
   git push origin v1.2.0
   ```
4. **GitHub Release** — the tag triggers a GitHub Release; the CHANGELOG section for that version becomes the release notes.

## What counts as a breaking change

- Removing or renaming an API endpoint or its HTTP method.
- Removing or renaming a required request field, header, or query parameter.
- Changing the shape of a successful response in a way that would break existing clients (e.g. removing a field, changing a type).
- Removing or renaming a webhook event type or any field in its payload.
- Changing authentication or authorisation semantics (e.g. new required scopes).
- Removing a feature flag or configuration key that was previously documented.

Deprecation notices are added at least one `MINOR` version before a breaking change is shipped.

## Packages

The `packages/types` npm workspace is versioned independently. Its own `CHANGELOG` lives alongside its `package.json`. Breaking changes there increment its own `MAJOR` regardless of the API server version.

## Backport policy

Critical security fixes may be backported to the previous `MINOR` release as a `PATCH` release. Non-security fixes are not backported.
