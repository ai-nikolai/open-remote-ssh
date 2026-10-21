# Open Remote - SSH - Copy

Connect to any machine with an SSH server and use it as your development environment.

![Open Remote SSH](https://raw.githubusercontent.com/ai-nikolai/open-remote-ssh/master/docs/images/open-remote-ssh.gif)

This is a [VSCodium](https://vscodium.com) fork of
[jeanp413/open-remote-ssh](https://github.com/jeanp413/open-remote-ssh), published on Open VSX as
[`ai-nikolai.open-remote-ssh-copy`](https://open-vsx.org/extension/ai-nikolai/open-remote-ssh-copy).

The reason for this copy is that multi-factor / two-factor authentication through a jump host works
more smoothly here (other custom features might follow later). Specifically, this SSH config works
beautifully:

```ssh_config
Host jump_host
	Hostname your_awesome_jump_host.com
	User $USER
	PreferredAuthentications keyboard-interactive

Host final_node
	HostName your_awesome_final_node.com
	User $USER
	ProxyJump jump_host
	PreferredAuthentications password
```

This assumes you have MFA on the jump host and then password authentication on the final node.
Change it around for the authentication method you actually use, i.e. replace
`PreferredAuthentications` with valid options (e.g. `publickey`, `password`,
`keyboard-interactive`).

## Using the extension

1. **Install** the extension from Open VSX (or
   `codium --install-extension ai-nikolai.open-remote-ssh-copy`) and restart VSCodium.
2. **Allow the proposed API** - this is required before you can connect to a host. The easiest way is
   to run the command `Remote-SSH: Enable Proposed API Support` and to restart VSCodium when it asks
   you to. See [Why do I have to edit `argv.json`?](#why-do-i-have-to-edit-argvjson) for the manual
   route and the reasoning behind it.
3. **Open the _SSH Explorer_ icon** in the activity bar. The `SSH Targets` view lists every host of
   your `~/.ssh/config` (nested `Include`s and multi-name `Host` lines included):
   - click a host to connect in a new window,
   - use the inline actions to connect in the current window, add a host or refresh,
   - hosts you connected to before are listed below the host with their recent folders.
4. **Or use the command palette**: `Remote-SSH: Connect to Host...` shows a quick pick of all
   configured hosts (you can also type a free-form `user@host`) and
   `Remote-SSH: Open SSH Configuration File...` opens your SSH config.

If something goes wrong, `Remote-SSH: Show Log` opens the extension log.

## Why do I have to edit `argv.json`?

Connecting to a host is implemented with the **proposed** `resolvers` API
(`vscode.workspace.registerRemoteAuthorityResolver`). Proposed APIs are unstable, so they are never
handed to a third-party extension unless you allow it explicitly: current VS Code / VSCodium builds
only grant them to the extensions allow-listed in the application's own `product.json`, and this
fork is not on that list. The extension therefore has to be allow-listed by you, once:

```json
{
    "enable-proposed-api": [
        "ai-nikolai.open-remote-ssh-copy"
    ]
}
```

The file is `argv.json` in your user data folder - `~/.vscode-oss/argv.json` for VSCodium - and you
can open it with the `Preferences: Configure Runtime Arguments` command. It is **only read when the
application starts**, so reloading the window is not enough: quit VSCodium completely and start it
again.

`Remote-SSH: Enable Proposed API Support` performs this edit for you and leaves the comments and the
rest of your `argv.json` untouched. As an alternative you can allow-list the extension for a single
launch on the command line: `codium --enable-proposed-api=ai-nikolai.open-remote-ssh-copy`.

Without the entry the `SSH Targets` view and the commands keep working - you just cannot connect, and
the log says
`Extension 'ai-nikolai.open-remote-ssh-copy' CANNOT use API proposal: resolvers`.

> **Further reading**: upstream VS Code documents proposed APIs and this allow-list in
> [Using Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api#sharing-extensions-using-the-proposed-api).

## SSH Host Requirements
You can connect to a running SSH server on the following platforms.

**Supported**:

- x86_64 Debian 8+, Ubuntu 16.04+, CentOS / RHEL 7+ Linux
- ARMv7l (AArch32) Raspbian Stretch/9+ (32-bit)
- ARMv8l (AArch64) Ubuntu 18.04+ (64-bit)
- IBM Z (s390x) Debian 13, RHEL 8+, Ubuntu 22.04+, SLES 15+
- macOS 10.14+ (Mojave)
- Windows 10+
- FreeBSD 13+ (Requires custom serverDownloadUrlTemplate setting)
- DragonFlyBSD (Requires manual remote-extension-host installation)

## Requirements

**Configuration**

You SSH server's configuration needs to have the following setting:
- `AllowTcpForwarding yes`

**Activation**

This extension needs the proposed `resolvers` API, which has to be allow-listed in `argv.json`
once and needs a full restart of VSCodium to take effect. See
[Why do I have to edit `argv.json`?](#why-do-i-have-to-edit-argvjson) for the how and why, or just
run the `Remote-SSH: Enable Proposed API Support` command.

**Alpine linux**

When running on alpine linux, the packages `libstdc++` and `bash` are necessary and can be installed via
running
```bash
sudo apk add bash libstdc++
```

## SSH configuration file

[OpenSSH](https://www.openssh.com/) supports using a [configuration file](https://linuxize.com/post/using-the-ssh-config-file/) to store all your different SSH connections.
To use an SSH config file, run the `Remote-SSH: Open SSH Configuration File...` command.

## Note for VSCode-OSS users

If you are using VSCode-OSS instead of VSCodium, you need some extra steps to make it work.

Modify the following entries in the plugin settings:

```
"remote.SSH.serverBinaryName": "codium-server",
"remote.SSH.serverDownloadUrlTemplate": "https://github.com/VSCodium/vscodium/releases/download/${version}${release}/vscodium-reh-${os}-${arch}-${version}${release}.tar.gz",
"remote.SSH.serverVersion": "latest",
"remote.SSH.serverValidation": "force",
```

VSCodium versions have an extra `release` part that do not have equivalent for VSCode-OSS.
So leaving `serverVersion` to the default `"match"` will fail.
The plugin will install the latest release of VSCodium if `serverVersion` is set to `"latest"`.
If you need to match the VSCode-OSS version, set `serverVersion` to `"closest"`, to
automatically fetch the last release of VSCodium for this version.

You can look for the release numbers associated with your VSCode version in the
[release page](https://github.com/VSCodium/vscodium/releases/). For instance, for VSCode
version "1.96.0", the (last) VSCodium release number is "24352".

You can also set `serverVersion` to a specic version (e.g. "1.116.0") or a specific
version-release (e.g. "1.116.02821").

If the local and remote VSCodium versions don't match, which will be the case on VSCode-OSS,
remote server validation needs to be bypassed. Setting `serverValidation` to `"force"` will
modify the commit of the remote server to make it match the local VSCode commit.
If `serverValidation` is set to `"skip"`, the remote server will skip checking that the commits
match. This option is working only if the remote VSCodium version is `>=1.120`.

Starting with VSCodium version 1.99.0, the `release` number is not separated from the `version` by a dot `.` anymore.
Therefore `serverDownloadUrlTemplate` needs to be filled with the new scheme (as shown above).

Before 1.99.0, the old scheme needs to be used:

```
"remote.SSH.serverDownloadUrlTemplate": "https://github.com/VSCodium/vscodium/releases/download/${version}.${release}/vscodium-reh-${os}-${arch}-${version}.${release}.tar.gz",
```
