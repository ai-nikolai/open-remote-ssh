# For local development

## Installation
1. Npm install
```bash
npm install
```

2. Npm build
```bash
npm run build
```

## Packaging:
1. Install VSCE
```bash
# Done once:
# npm install -g @vscode/vsce
```
2. Create the .vsix
```bash
vsce package
```

3. Install locally to test:
```bash
codium --install-extension ./open-remote-ssh-copy-0.3.3.vsix
```

## Potentially publishing the package on open-vsx.org

Upload .vsix file: `https://open-vsx.org/user-settings/extensions`

Current extension: `https://open-vsx.org/user-settings/extensions/ai-nikolai/open-remote-ssh-copy`


or: via terminal
1. Install once
```bash
npm install -g ovsx
```
2. Then run
```bash
export CODIUM_API=""
ovsx publish open-remote-ssh-copy-0.3.3.vsix -p $CODIUM_API
```
## Publishing from CI (GitHub Actions) - remaining setup

`.github/workflows/publish.yml` builds the `.vsix`, creates the GitHub release and publishes to
Open VSX on every `v*` tag. Two values have to be added to the GitHub repository first
(Settings -> Secrets and variables -> Actions):

1. **Variable** (tab *Variables*): name `PUBLISH_OPENVSX`, value `yes`.
   The workflow reads `vars.PUBLISH_OPENVSX`; any other value (or none) skips the publish step
   silently.
2. **Secret**: name `OPEN_VSX_PAT`, value an Open VSX access token that may publish the
   `ai-nikolai` namespace - create it under <https://open-vsx.org/user-settings/tokens>.
   This is the same token as `CODIUM_API` for the manual `ovsx publish` above.
   Add it as an *environment* secret on the `publish` environment
   (Settings -> Environments -> publish -> Environment secrets), because the job declares
   `environment: publish`; a plain repository secret works as well and is overridden by the
   environment one of the same name.

`PUBLISH_VSCODE` and `TOKEN_VSCODE` are only used by the commented-out VS Marketplace step and are
not needed.

Then tag a release (the tag is what triggers the workflow):

```bash
# 1. bump "version" in package.json and add the matching "## <version>" section to CHANGELOG.md
git add -A
git commit -m "build: release 0.3.4"
git push origin master

# 2. tag and push - this runs the publish workflow
git tag v0.3.4
git push origin v0.3.4
```

Two things to keep in mind:

- The version in `package.json` must equal the tag without the `v`, and `CHANGELOG.md` must contain
  a `## <version>` heading for it, otherwise `.github/scripts/get-changelog.js` fails the run.
  The version must also not exist on Open VSX yet: with `skipDuplicate: true` the publish step
  passes but uploads nothing, so bump first (0.3.3 is already published).
- The workflow file has to be on `master` before tagging, since a tag runs the workflow from its own
  commit. Re-running a tag whose GitHub release already has a `.vsix` reuses that file instead of
  rebuilding it.
