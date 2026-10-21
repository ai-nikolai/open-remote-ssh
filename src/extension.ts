import * as vscode from 'vscode';
import { Log } from './common/logger';
import { RemoteSSHResolver, REMOTE_SSH_AUTHORITY } from './authResolver';
import { openSSHConfigFile, promptOpenRemoteSSHWindow } from './commands';
import { HostTreeDataProvider } from './hostTreeView';
import { getRemoteWorkspaceLocationData, RemoteLocationHistory } from './remoteLocationHistory';
import { allowProposedApi, getProposedApiTarget, isProposedApiError, ProposedApiTargetInfo } from './proposedApi';
import { getErrorMessage } from './common/errors';

export async function activate(context: vscode.ExtensionContext) {
    const logger = new Log('Remote - SSH');
    context.subscriptions.push(logger);
    const extensionId = context.extension.id;

    // Register the essentials first: whatever happens below, the `SSH Targets`
    // view must always get a data provider, otherwise VS Code shows
    // "There is no data provider registered that can provide view data".
    const locationHistory = new RemoteLocationHistory(context);
    try {
        const locationData = getRemoteWorkspaceLocationData();
        if (locationData) {
            await locationHistory.addLocation(locationData[0], locationData[1]);
        }
    } catch (error) {
        logger.error(`Failed to restore the remote location history: ${getErrorMessage(error)}`);
    }

    const hostTreeDataProvider = new HostTreeDataProvider(locationHistory, logger);
    context.subscriptions.push(hostTreeDataProvider);
    try {
        const treeView = vscode.window.createTreeView('sshHosts', { treeDataProvider: hostTreeDataProvider });
        hostTreeDataProvider.attachView(treeView);
        context.subscriptions.push(treeView);
    } catch (error) {
        logger.error(`Failed to create the SSH Targets view: ${getErrorMessage(error)}`);
    }

    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openEmptyWindow', () => promptOpenRemoteSSHWindow(false)));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openEmptyWindowInCurrentWindow', () => promptOpenRemoteSSHWindow(true)));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.openConfigFile', () => openSSHConfigFile()));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.showLog', () => logger.show()));
    context.subscriptions.push(vscode.commands.registerCommand('openremotessh.enableProposedApi', () => enableProposedApi(logger, extensionId)));

    // The remote authority resolver is a proposed API. When the running
    // application does not allow it (see `enabledApiProposals` in
    // package.json), registering it throws. That used to abort `activate()`
    // entirely, which is why the whole extension - and with it the
    // `SSH Targets` view - appeared to be broken.
    let remoteSSHResolver: RemoteSSHResolver | undefined;
    try {
        remoteSSHResolver = new RemoteSSHResolver(context, logger);
        context.subscriptions.push(vscode.workspace.registerRemoteAuthorityResolver(REMOTE_SSH_AUTHORITY, remoteSSHResolver));
        context.subscriptions.push(remoteSSHResolver);
    } catch (error) {
        remoteSSHResolver?.dispose();
        logger.error(`Failed to register the remote authority resolver: ${getErrorMessage(error)}`);
        if (isProposedApiError(error)) {
            logger.error('Remote connections need the `resolvers` proposed API. Allow it with the `Remote-SSH: Enable Proposed API Support` command.');
            void promptEnableProposedApi(logger, extensionId);
        }
    }
}

async function enableProposedApi(logger: Log, extensionId: string): Promise<void> {
    try {
        const outcome = await allowProposedApi(extensionId);
        const message = outcome.status === 'already-enabled'
            ? `"${extensionId}" is already allowed to use proposed APIs in ${outcome.path}. `
            : `"${extensionId}" was added to ${outcome.path}. `;

        const action = await vscode.window.showInformationMessage(
            message
            + 'Restart the application (the file is only read at startup, reloading the window is not enough) '
            + 'to activate SSH support.',
            `Open ${outcome.target}`
        );
        if (action) {
            await openProposedApiTarget(outcome, logger);
        }
    } catch (error) {
        logger.error(`Failed to update the proposed API configuration: ${getErrorMessage(error)}`);
        const action = await vscode.window.showErrorMessage(
            `Could not allow "${extensionId}" to use proposed APIs: ${getErrorMessage(error)}`,
            'Open file'
        );
        if (action) {
            await openProposedApiTarget(getProposedApiTarget(), logger);
        }
    }
}

/**
 * Open the file the proposed-API entry lives in. `argv.json` has a built-in
 * command (it also offers a template when the file does not exist yet); the
 * user `product.json` has to be opened directly.
 */
async function openProposedApiTarget(info: ProposedApiTargetInfo, logger: Log): Promise<void> {
    if (info.target === 'argv.json') {
        await vscode.commands.executeCommand('workbench.action.configureRuntimeArguments');
        return;
    }

    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(info.path));
        await vscode.window.showTextDocument(document);
    } catch (error) {
        logger.error(`Could not open ${info.path}: ${getErrorMessage(error)}`);
        await vscode.window.showWarningMessage(
            `Could not open ${info.path}. Create it with the "Remote-SSH: Enable Proposed API Support" command first.`
        );
    }
}

async function promptEnableProposedApi(logger: Log, extensionId: string): Promise<void> {
    const target = getProposedApiTarget();
    const add = `Add to ${target.target}`;
    const open = 'Open file';
    const choice = await vscode.window.showErrorMessage(
        'Remote - SSH cannot connect to SSH hosts because the running application does not allow the `resolvers` proposed API. '
        + `Add "${extensionId}" to "${target.path}" and restart the application (it is only read at startup). `
        + 'The "SSH Targets" view keeps working meanwhile.',
        add,
        open
    );

    if (choice === add) {
        await enableProposedApi(logger, extensionId);
    } else if (choice === open) {
        await openProposedApiTarget(target, logger);
    }
}

export function deactivate() {
}
