# Security policy

## Project status

This is experimental, community-maintained macOS UI automation. Only the latest
release is maintained. It is not a microphone/camera privacy guarantee, an
enterprise control, or a replacement for a hardware mute or camera cover.

## Reporting a vulnerability

Do not post secrets, exploit details, meeting information, or private diagnostic
output in a public issue.

Use the repository's **Security → Report a vulnerability** option to submit a
private report when available. If private reporting is not enabled, open a
minimal issue asking the maintainer to establish a private reporting channel;
do not include vulnerability details until one is provided. Maintainers should
enable GitHub private vulnerability reporting before publishing this project.

Include the affected release, macOS/Teams/Stream Deck versions, a minimal
reproduction, and the potential impact. Use a private test meeting and remove
names, meeting links, participant data, and local account paths.

## Permission and trust boundaries

- The helper needs macOS Accessibility permission to inspect and press Teams UI
  controls. This is a powerful permission; review the source and revoke access
  when it is no longer needed.
- The plugin communicates with Stream Deck over its host-provided localhost
  WebSocket and with its helper through stdin/stdout. It starts no HTTP server
  and makes no application-level cloud or telemetry requests.
- Update checks performed by development tools, npm dependency downloads, and
  Stream Deck's own services are outside this runtime claim.
- The helper accepts a fixed allowlist of controls and reactions. Unknown,
  disabled, ambiguous, or stale state must never be interpreted as safely muted.
- Accessibility provides a press operation, not an atomic set-state operation.
  Concurrent UI changes can race. A timed-out operation might still have been
  applied; check Teams manually and never blindly retry.
- Reaction feedback confirms an accepted UI press, not delivery to participants.
- Builds use ad-hoc signing, not Developer ID signing or Apple notarisation.
  Checksums establish file integrity only when obtained through a trusted
  channel; they do not establish publisher identity. Do not disable Gatekeeper.

## Sensitive files

Never commit credentials, signing certificates/private keys, `.env` files,
local logs, meeting screenshots, or unredacted diagnostics. Git ignore rules
are a convenience, not a security boundary. Review the Git index and history
before publishing. If a credential is exposed, revoke it immediately; deleting
it in a later commit is not sufficient.
