# Changelog

This project is experimental. Versions use Semantic Versioning; UI compatibility
can change independently when Teams updates.

## Unreleased

- Public repository documentation, MIT license, security/contribution guidance.
- macOS CI, dependency updates, and tag-triggered draft releases.
- Shared package-version metadata, clean packaging, and SHA-256 checksums.

## 0.3.0

- Configurable meeting reactions: Like, Love, Applause, Laugh, and Surprised.
- Per-key persisted reaction selection and duplicate-press suppression.
- Exact picker signature and same-window checks; no automatic retries.
- Reaction feedback distinguishes UI press acceptance from meeting delivery.

## 0.2.0

- Independent Teams camera toggle action and state feedback.
- Shared helper with separate microphone/camera state and command routing.

## 0.1.1

- Restore executable permission on helpers extracted by Stream Deck's installer.
- Open Accessibility settings when permission is requested, even if the helper
  is unavailable, and surface helper launch errors.

## 0.1.0

- Initial microphone action using macOS Accessibility rather than hotkeys.
- Native helper, state feedback, permission setup, and local packaging.
