## 0.3.3

- fix: the `SSH Targets` explorer view no longer shows
  "There is no data provider registered that can provide view data" on recent VSCodium/VS Code
  builds. Activation used to abort when the `resolvers` proposed API was denied, so the view never
  got a data provider. The view and the commands are now registered before the resolver registration
  and a denied proposal is reported instead of breaking the whole extension, which keeps the host
  list usable.
- feat: new command `Remote-SSH: Enable Proposed API Support` that allow-lists the extension in
  `argv.json` (`enable-proposed-api`) and offers to open that file. Proposed APIs are only granted to
  allow-listed extensions in current VS Code/VSCodium builds, so remote connections need this entry.
- fix: `Remote-SSH: Enable Proposed API Support` no longer mistakes a commented out
  `// "enable-proposed-api": [...]` line in `argv.json` for an active entry. The file is parsed
  comment-aware, so the entry is really added and connections work after the restart. Writing is
  refused (instead of corrupting the file) when the existing value is not an array.
- fix: the `argv.json` entry is written for the id of the running extension
  (`context.extension.id`) instead of a hard-coded one.
- fix: dropped the unused `contribViewsRemote` proposal and the `remoteName` property of the view -
  the view lives in its own activity bar container, so it can be hidden/moved again and needs one
  proposed API less.
- fix: an unreadable or malformed SSH configuration is now reported inside the view instead of
  breaking it.
- docs: README reworked around the `argv.json` step - what the file is, why the proposed API has to
  be allow-listed, how to do it, and the `--enable-proposed-api` command line alternative.
- build: fixed the lint setup: removed the obsolete `.eslintignore` (ESLint 9+ ignores it, the same
  paths are configured in `eslint.config.mjs`), replaced the deprecated boolean
  `allowTemplateLiterals` with `"always"`, and dropped `npm audit` from the `lint-staged` pre-commit
  hook so dev-dependency advisories no longer block every commit (it still runs in
  `npm run lint:all` and CI).

## 0.3.2
- Added Seperate icon on activity bar (as remote icon is not displaying)

## 0.3.1 (from upstream)

- fix(windows): use improved command to test archive (#331)

## 0.3.0 (from upstream)

- feat: list configured SSH hosts in the Connect to Host prompt (#319)
- feat: support `ForwardAgent` (#310)
- feat: support PEM-encoded password-protected ssh keys (#249)
- feat: add tests (#314)
- enhance: add integrity check of the archive (#323)
- enhance: fall back to private key when .pub file parsing fails (#268)
- feat: use official simple-socks (#324)
- fix(alpine): pass flock and expose error on missing libstdc++ (#315)
- fix: sanitize the extension ids (#321)
- fix(macos): use a fixed file descriptor due to bash3 (#326)

## 0.2.2 
- enhance: readme updated to reflect the new package

## 0.2.1
- feat: MFA authentication via jump host works well

## 0.2.0 (branched-off from upstream)
- feat: add compatibility with Code-OSS (#189)
- remodel: use base64 encoding for install script to support csh/tcsh login shells (#296)
- enhance(linux): use `flock` to prevent multiple server install scripts running in parallel (#285)
- enhance: increase polling loop to aid slowish machines (#290)
- refactor: rename `serverBinaryName` setting (#280)
- refactor: extract install scripts from `serverSetup.ts` into script files (#287)

## 0.1.2
- fix: split ProxyCommand into argv tokens before spawn (#274)

## 0.1.1
- don't assume `ProxyCommand` value's type (#270)

## 0.1.0
- replace `which` with `command -v` (#215)
- allow automatic download of remote extension host on FreeBSD (#244)
- add remote.SSH.serverInstallPath option (#259)
- cleanup on errors (#172)
- typo `attemp` -> `attempt` (#185)
- use original ssh-config dependency (#267)

## 0.0.49
- remove default `remote.SSH.serverDownloadUrlTemplate`

## 0.0.48
- Support `%n` in ProxyCommand
- fix: add missing direct @types/ssh2-stream dependency (#177)
- fix Win32 internal error (#178)

## 0.0.47
- Add support for loong64 (#175)
- Add s390x support (#174)
- Support vscodium alpine reh (#142)

## 0.0.46
- Add riscv64 support (#147)

## 0.0.45
- Use windows-x64 server on windows-arm64

## 0.0.44
- Update ssh2 lib
- Properly set extensionHost env variables

## 0.0.43
- Fix parsing multiple include directives

## 0.0.42
- Fix remote label to show port when connecting to a port other than 22

## 0.0.41
- Take into account parsed port from ssh destination. Fixes (#110)

## 0.0.40
- Update ssh-config package

## 0.0.39

- output error messages when downloading vscode server (#39)
- Add PreferredAuthentications support (#97)

## 0.0.38

- Enable remote support for ppc64le (#93)

## 0.0.37

- Default to Current OS User in Connection String if No User Provided (#91)
- Add support for (unofficial) DragonFly reh (#86)

## 0.0.36

- Make wget support continue download (#85)

## 0.0.35

- Fixes hardcoded agentsock for windows breaks pageant compatibility (#81)

## 0.0.34

- Add remote.SSH.connectTimeout setting
- adding %r username replacement to proxycommand (#77)

## 0.0.33

- feat: support %r user substitution in proxycommand

## 0.0.32

- feat: use serverDownloadUrlTemplate from product.json (#59)

## 0.0.31

- feat: support glob patterns in SSH include directives

## 0.0.30

- feat: support file patterns in SSH include directives
