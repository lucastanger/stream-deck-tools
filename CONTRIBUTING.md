# Contributing

Thanks for helping improve Teams Controls for Stream Deck.

## Development setup

Use macOS, Xcode Command Line Tools, and Node.js 22 or newer. `.nvmrc` selects
Node 22, also used in CI. Stream Deck supplies its own Node 20 runtime for the
packaged plugin; end users do not need Node or Swift installed.

```bash
nvm use                 # optional, if you use nvm
npm ci
npm run check           # universal native build, self-tests, JS tests, validation
npm run package         # check, package, and SHA-256 checksum
```

Build/test tools must not require a real Teams meeting or Accessibility access.
Automated tests use a fake helper; native self-tests only exercise pure logic.
Use `npm run test:model` to run the platform-independent model tests without a
macOS build. Full integration and manifest tests require `npm run build` first.

## Safety requirements

- Never invoke real mute/camera/meeting actions as part of CI or automatic tests.
- Use a private test call for manual testing. A camera/microphone toggle may
  expose audio or video, and a reaction is visible to meeting participants.
- Do not guess unknown state, optimistically show mute/camera confirmation,
  silently select another reaction, or automatically retry a press.
- Keep each control's state independent. Missing camera or reaction controls
  must not break a uniquely identified microphone control.
- Keep exact-label, uniqueness, enabled-state, same-window picker, and stale-state
  checks. Do not add fallback coordinate clicks or broad chat-reaction matching.
- UI setup/configuration must never send a reaction or toggle a meeting control.
- Diagnostic output must not contain conversations, participant names, meeting
  titles, links, tokens, or absolute home-directory paths.
- Preserve plugin/helper/action identifiers unless an explicit migration exists.
  The legacy `com.local.teamsmic` and **Teams Mic** names are intentional.

## Pull requests

Describe the problem, changes, safety implications, and tests. Add or update
model, native self-tests, and mocked-host tests for behaviour changes. Keep
changes focused. Review [SECURITY.md](SECURITY.md) before posting diagnostics.

For UI-dependent changes, report versions and test results for a private call,
Teams in the background, minimise/restore, joining/leaving meetings, disabled
controls, and reconnecting. Clearly distinguish observed behaviour from inferred
or untested behaviour. Do not upload live meeting screenshots.

## Releases

See [docs/PUBLISHING.md](docs/PUBLISHING.md). New code is contributed under the
repository's MIT license. This project is unaffiliated with Microsoft and Elgato.
