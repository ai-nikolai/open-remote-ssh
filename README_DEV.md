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