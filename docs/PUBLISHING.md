# Publishing the repository and releases

These instructions prepare a **public repository under your personal GitHub
account**. They do not require publishing to npm or the Elgato Marketplace.
`package.json` is marked `private` to prevent accidental npm publication.

Suggested repository name: **teams-controls-streamdeck**. No GitHub owner/URL is
hard-coded; choose the account and name before adding repository/homepage links.

## Before the first public push

1. Confirm you own or have permission to publish all source. Review the MIT
   license and its copyright attribution; change the license before publication
   if MIT is not what you intend.
2. Check your **local commit identity**, especially on a work-configured Mac:
   ```bash
   git config --get user.name
   git config --get user.email
   ```
   If necessary, set a personal identity for this repository only, using the exact
   noreply address shown in **GitHub → Settings → Emails**:
   ```bash
   git config --local user.name "YOUR_NAME"
   git config --local user.email "YOUR_GITHUB_NOREPLY_EMAIL"
   ```
   Do not copy these placeholders literally. Do not change global settings just
   to publish this project. A public commit exposes its author/committer email.
3. Run a clean dependency install and checks on macOS:
   ```bash
   npm ci
   npm run package
   ```
   Tests must not request Accessibility access, send reactions, or toggle controls.
4. Review every file to be published. Do not include meeting screenshots/logs,
   credentials, signing material, local account paths, or generated output.
   `.gitignore` is not a secret scanner. Check both index and history if the
   repository already has commits; removing a file later does not erase it.
   Revoke any exposed credentials before publishing.
5. Review any employer/organisation restrictions and code ownership before
   publishing from a work-managed machine. The preparation scripts do not alter
   Git identity or claim that these checks have been satisfied.

## Create the first commit

This workspace may already have been initialised with an empty `main` branch.
If not, run `git init -b main`. Preparation does not stage or commit files.

```bash
git status --short --untracked-files=all
git add .
git diff --cached --stat
git diff --cached --check
git diff --cached           # review the actual public contents
# Unstage and remove anything unintended before proceeding.
git commit -m "chore: prepare initial public release"
```

Generated `dist/`, `.build/`, `.sdPlugin`, dependency directories, and local
credentials should not appear in the index. Initial commits are yours to make
with the identity you selected. Do not force-push existing history to make it
appear clean; audit it first.

## Create the public GitHub repository

Using GitHub CLI, authenticate interactively if needed. Do not paste tokens into
chat, source files, or shell commands. Verify the active account is your personal
account before creating the repository:

```bash
gh auth status
# If needed, switch to an already authenticated personal account:
# gh auth switch --user YOUR_PERSONAL_LOGIN
gh api user --jq .login
```

After verifying that login, create the public repository and push:

```bash
ACCOUNT=$(gh api user --jq .login)
gh repo create "$ACCOUNT/teams-controls-streamdeck" \
  --public --source=. --remote=origin --push \
  --description "Teams microphone, camera, and reactions for Stream Deck on macOS"
```

This command **publishes code publicly**. Run it only after review and the first
commit. If you prefer the web UI, create an empty public repository without
initialising a README/license, then add its SSH/HTTPS URL as `origin` and push
`main`. Do not create a duplicate repository if one already exists.

## Configure GitHub

- Enable Actions for this repository; CI needs macOS runners.
- Enable private vulnerability reporting under **Settings → Security** (the
  exact section label may vary), and secret scanning/push protection where
  available.
- Protect `main` with a ruleset requiring the **build-and-test** CI check and
  review as appropriate. Run CI once before selecting the required check.
- Review Dependabot's weekly npm and Actions updates.
- Optionally disable unused wiki/discussions and add topics such as `stream-deck`,
  `microsoft-teams`, `macos`, and `accessibility`.
- Once the final owner/name is known, add the actual repository/homepage/issue
  links to `package.json` and a release link or CI badge to README if desired.
  No fake owner or company contact is included by default.

## Build a release

The npm package version is the single source of truth for built manifest and
helper versions. `scripts/build.mjs` overrides the manifest template's `Version`.
Only stable `major.minor.patch` versions are currently supported.

For a new version (for example `0.3.1`):

```bash
npm version 0.3.1 --no-git-tag-version
# Move relevant CHANGELOG.md entries out of Unreleased; update documentation.
npm run package
git diff --check
# Review, stage, and commit source changes, package.json, and package-lock.json.
# Do not commit generated installers or certificates.
```

For the current first release, the version is already `0.3.0`; publish that only
when its documented compatibility/limitations are acceptable. To tag a reviewed,
committed version:

```bash
VERSION=$(node -p "require('./package.json').version")
git tag -a "v$VERSION" -m "Teams Controls $VERSION"
git push origin main
git push origin "v$VERSION"
```

Pushing a `v*` tag starts `.github/workflows/release.yml`, which:

1. Requires the tag to match `package.json` exactly.
2. Builds the universal helper, runs safe tests, validates the plugin, strips
   Finder metadata, verifies the ad-hoc signature, and creates package/checksum.
3. Uploads the built artifacts from a read-only build job.
4. Verifies the checksum in a separate job with narrowly scoped `contents: write`
   permission and creates a **draft**, not an automatically public release.

Review the draft, limitations, changelog, and installer in a private test call,
then publish it manually in GitHub Releases. The workflow uses only GitHub's
short-lived built-in token; no personal access token or signing secret is needed.
A rerun with an existing draft fails rather than silently replacing its assets;
review/delete that draft deliberately before rerunning if necessary. Organisation
policy may restrict Actions write permissions; review repository settings if the
release job is denied.

The release package is ad-hoc signed and **not Apple-notarised**. Do not represent
it as an authenticated Developer ID release. Notarised distribution is separate
future work and would require securely managed signing/notarisation credentials.
Never commit those credentials.

## Local package integrity

```bash
cd dist
shasum -a 256 -c com.local.teamsmic.streamDeckPlugin.sha256
```

The helper inside the unpacked build can also be checked:

```bash
codesign --verify --deep --strict \
  'com.local.teamsmic.sdPlugin/bin/Teams Mic Helper.app'
```

CI packages use different ad-hoc signatures/toolchains and are not promised to be
byte-for-byte reproducible across machines. The checksum belongs to its specific
built asset, not all builds of the same source version.
