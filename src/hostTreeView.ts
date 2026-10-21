import * as vscode from 'vscode';
import * as path from 'path';
import SSHConfiguration, { getSSHConfigPath } from './ssh/sshConfig';
import { RemoteLocationHistory } from './remoteLocationHistory';
import { Disposable } from './common/disposable';
import { addNewHost, openRemoteSSHLocationWindow, openRemoteSSHWindow, openSSHConfigFile } from './commands';
import { Log } from './common/logger';
import { getErrorMessage } from './common/errors';
import SSHDestination from './ssh/sshDestination';

class HostItem {
    constructor(
        public hostname: string,
        public locations: string[]
    ) {
    }
}

class HostLocationItem {
    constructor(
        public path: string,
        public hostname: string
    ) {
    }
}

type DataTreeItem = HostItem | HostLocationItem;

export class HostTreeDataProvider extends Disposable implements vscode.TreeDataProvider<DataTreeItem> {

    private readonly _onDidChangeTreeData = this._register(new vscode.EventEmitter<DataTreeItem | DataTreeItem[] | void>());
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private view: vscode.TreeView<DataTreeItem> | undefined;

    constructor(
        private locationHistory: RemoteLocationHistory,
        private logger: Log
    ) {
        super();

        this._register(vscode.commands.registerCommand('openremotessh.explorer.add', () => addNewHost()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.configure', () => openSSHConfigFile()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.refresh', () => this.refresh()));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.emptyWindowInNewWindow', e => this.openRemoteSSHWindow(e, false)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.emptyWindowInCurrentWindow', e => this.openRemoteSSHWindow(e, true)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.reopenFolderInNewWindow', e => this.openRemoteSSHLocationWindow(e, false)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.reopenFolderInCurrentWindow', e => this.openRemoteSSHLocationWindow(e, true)));
        this._register(vscode.commands.registerCommand('openremotessh.explorer.deleteFolderHistoryItem', e => this.deleteHostLocation(e)));

        this._register(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('remote.SSH.configFile')) {
                this.refresh();
            }
        }));
        this._register(vscode.workspace.onDidSaveTextDocument(e => {
            if (e.uri.fsPath === getSSHConfigPath()) {
                this.refresh();
            }
        }));
    }

    /**
     * Give the provider access to its view so that errors (for example an
     * unreadable SSH configuration) can be shown in the view itself instead of
     * leaving the user with an empty list.
     */
    attachView(view: vscode.TreeView<DataTreeItem>) {
        this.view = view;
        this.refresh();
    }

    getTreeItem(element: DataTreeItem): vscode.TreeItem {
        if (element instanceof HostLocationItem) {
            const label = path.posix.basename(element.path).replace(/\.code-workspace$/, ' (Workspace)');
            const treeItem = new vscode.TreeItem(label);
            treeItem.description = path.posix.dirname(element.path);
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'openremotessh.explorer.folder';
            return treeItem;
        }

        const treeItem = new vscode.TreeItem(element.hostname);
        treeItem.collapsibleState = element.locations.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        treeItem.iconPath = new vscode.ThemeIcon('vm');
        treeItem.contextValue = 'openremotessh.explorer.host';
        return treeItem;
    }

    async getChildren(element?: HostItem): Promise<DataTreeItem[]> {
        if (!element) {
            try {
                const sshConfigFile = await SSHConfiguration.loadFromFS();
                const hosts = sshConfigFile.getAllConfiguredHosts();
                this.setMessage(undefined);
                return hosts.map(hostname => new HostItem(hostname, this.locationHistory.getHistory(hostname)));
            } catch (error) {
                // A missing or malformed ssh config must not break the view.
                this.logger.error(`Failed to read the SSH configuration: ${getErrorMessage(error)}`);
                this.setMessage(`Failed to read the SSH configuration: ${getErrorMessage(error)}`);
                return [];
            }
        }
        if (element instanceof HostItem) {
            return element.locations.map(location => new HostLocationItem(location, element.hostname));
        }
        return [];
    }

    private setMessage(message: string | undefined) {
        if (this.view && this.view.message !== message) {
            this.view.message = message;
        }
    }

    private refresh() {
        this._onDidChangeTreeData.fire();
    }

    private async deleteHostLocation(element: HostLocationItem) {
        await this.locationHistory.removeLocation(element.hostname, element.path);
        this.refresh();
    }

    private async openRemoteSSHWindow(element: HostItem, reuseWindow: boolean) {
        const sshDest = new SSHDestination(element.hostname);
        openRemoteSSHWindow(sshDest.toEncodedString(), reuseWindow);
    }

    private async openRemoteSSHLocationWindow(element: HostLocationItem, reuseWindow: boolean) {
        const sshDest = new SSHDestination(element.hostname);
        openRemoteSSHLocationWindow(sshDest.toEncodedString(), element.path, reuseWindow);
    }
}
