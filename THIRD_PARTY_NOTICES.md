# Third-party notices

The repository's original source code is provided under the MIT license in
[LICENSE](LICENSE).

## Redistributed runtime code

- **ws** — WebSocket client implementation, MIT licensed. Its complete license is
  copied from `node_modules/ws/LICENSE` into each plugin as `WS-LICENSE.txt`.

The plugin's icons are generated from drawing code in `scripts/icons.swift`;
no Microsoft or Elgato logos, meeting screenshots, or proprietary icon assets
are included.

## Build tools and host components

Development dependencies and their exact versions are recorded in
`package-lock.json`. Their respective licenses remain in their installed npm
packages. The plugin does not redistribute the Elgato CLI, esbuild executable,
Stream Deck application, Node.js runtime, Microsoft Teams, or Apple frameworks.
The JavaScript bundle contains ws code; the native helper uses system frameworks.

Microsoft, Microsoft Teams, Elgato, and Stream Deck are trademarks of their
respective owners. This is an independent, unofficial project and is not
endorsed by or affiliated with Microsoft or Elgato.
