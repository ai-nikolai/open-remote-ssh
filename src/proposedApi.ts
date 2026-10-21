import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getErrorMessage } from './common/errors';

/**
 * Helpers dealing with VS Code's proposed APIs.
 *
 * This extension cannot work without the proposed `resolvers` API
 * (`vscode.workspace.registerRemoteAuthorityResolver`). Recent versions of
 * VS Code / VSCodium only hand out proposed APIs to extensions that are
 * allow-listed in the application's `product.json`, so a third party
 * extension has to ask the user to allow it explicitly. There are two ways to
 * do that and both are only read at process start:
 *
 * 1. `argv.json` (everywhere):
 *
 * ```json
 * {
 *     "enable-proposed-api": ["ai-nikolai.open-remote-ssh-copy"]
 * }
 * ```
 *
 * 2. The *user* `product.json` (VSCodium only). VSCodium patches VS Code to
 *    deep-merge `<userDataDir>/product.json` over its built-in product
 *    configuration, which is exactly the file that holds the allow-list:
 *
 * ```json
 * {
 *     "extensionEnabledApiProposals": {
 *         "ai-nikolai.open-remote-ssh-copy": ["resolvers"]
 *     }
 * }
 * ```
 *
 *    It survives application updates and leaves `argv.json` alone, so it is
 *    preferred whenever the running application supports it.
 *
 * Everything in here is written so that a missing proposed API can never
 * break the extension: it is detected, reported in a actionable way and the
 * rest of the extension keeps working.
 */

export const EXTENSION_ID = 'ai-nikolai.open-remote-ssh-copy';

const ENABLE_PROPOSED_API_KEY = 'enable-proposed-api';

/** Key of the proposed-API allow-list inside a `product.json`. */
const ENABLE_PROPOSED_API_PRODUCT_KEY = 'extensionEnabledApiProposals';

/** The one proposal this extension needs. */
export const RESOLVERS_PROPOSAL = 'resolvers';

interface ProductJson {
    readonly nameShort?: string;
    readonly nameLong?: string;
    readonly dataFolderName?: string;
}

/** The `product.json` shipped with the running application. */
function readProductJson(): ProductJson {
    try {
        return JSON.parse(fs.readFileSync(path.join(vscode.env.appRoot, 'product.json'), 'utf8')) as ProductJson;
    } catch {
        return {};
    }
}

/**
 * `true` when the given error is VS Code's "you may not use this proposed
 * API" error, which is thrown by the extension host when an extension did not
 * get the proposal it asked for.
 */
export function isProposedApiError(error: unknown): boolean {
    return /cannot use api proposal/i.test(getErrorMessage(error));
}

/**
 * Path of the `argv.json` file of the running application
 * (e.g. `~/.vscode-oss/argv.json` for VSCodium).
 */
export function getArgvJsonPath(): string {
    // Portable installations keep argv.json next to the executable, mirroring
    // what `EnvironmentService#argvResource` does in VS Code.
    const portable = process.env.VSCODE_PORTABLE;
    if (portable) {
        return path.join(portable, 'argv.json');
    }
    return path.join(os.homedir(), getDataFolderName(), 'argv.json');
}

function getDataFolderName(): string {
    const product = readProductJson();
    if (product.dataFolderName) {
        return product.dataFolderName;
    }

    for (const folder of ['.vscode-oss', '.vscode', '.vscode-insiders', '.vscode-server']) {
        if (fs.existsSync(path.join(os.homedir(), folder))) {
            return folder;
        }
    }

    return '.vscode-oss';
}

/**
 * Replace every comment character in a JSONC document with a space while
 * leaving string literals untouched. The result has exactly the same length
 * as the input, so positions found in the masked document can be used to
 * slice the original one.
 *
 * This is what keeps us from mistaking a commented out
 * `// "enable-proposed-api": [...]` for a real entry - a mistake that would
 * leave the user with a "restart is enough" message while the proposal stays
 * disabled forever.
 */
export function maskComments(content: string): string {
    let result = '';
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];

        if (inLineComment) {
            if (char === '\n') {
                inLineComment = false;
                result += char;
            } else {
                result += ' ';
            }
            continue;
        }

        if (inBlockComment) {
            if (char === '*' && next === '/') {
                inBlockComment = false;
                result += '  ';
                i++;
            } else {
                result += char === '\n' ? '\n' : ' ';
            }
            continue;
        }

        if (inString) {
            result += char;
            if (char === '\\') {
                result += next ?? '';
                i++;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            result += char;
        } else if (char === '/' && next === '/') {
            inLineComment = true;
            result += '  ';
            i++;
        } else if (char === '/' && next === '*') {
            inBlockComment = true;
            result += '  ';
            i++;
        } else {
            result += char;
        }
    }

    return result;
}

/**
 * Validate JSONC content (comments and trailing commas are allowed).
 */
export function isValidJsonc(content: string): boolean {
    try {
        JSON.parse(maskComments(content).replace(/,(\s*[}\]])/g, '$1'));
        return true;
    } catch {
        return false;
    }
}

/**
 * Add `extensionId` to the `enable-proposed-api` array of the given
 * `argv.json` content, preserving comments and formatting as much as
 * possible. Returns the unchanged content when the extension is already
 * allowed.
 */
export function addEnableProposedApiEntry(content: string, extensionId: string = EXTENSION_ID): string {
    const masked = maskComments(content);
    const keyMatch = new RegExp(`"${ENABLE_PROPOSED_API_KEY}"\\s*:`).exec(masked);

    if (keyMatch) {
        const valueStart = keyMatch.index + keyMatch[0].length;
        const arrayStart = masked.indexOf('[', valueStart);
        const arrayEnd = arrayStart === -1 ? -1 : masked.indexOf(']', arrayStart);
        // Only whitespace may sit between the key and its array; otherwise
        // the value is something we do not understand and must not rewrite.
        if (arrayStart === -1 || arrayEnd === -1 || masked.slice(valueStart, arrayStart).trim() !== '') {
            throw new Error(`Malformed "${ENABLE_PROPOSED_API_KEY}" entry in argv.json.`);
        }

        if (masked.slice(arrayStart + 1, arrayEnd).toLowerCase().includes(`"${extensionId.toLowerCase()}"`)) {
            return content;
        }

        const entries = content.slice(arrayStart + 1, arrayEnd).trim();
        const insertion = entries.length === 0
            ? `"${extensionId}"`
            : `${entries.replace(/,\s*$/, '')}, "${extensionId}"`;
        return content.slice(0, arrayStart + 1) + ` ${insertion} ` + content.slice(arrayEnd);
    }

    const braceIndex = content.indexOf('{');
    if (braceIndex === -1) {
        return `{\n\t"${ENABLE_PROPOSED_API_KEY}": ["${extensionId}"]\n}\n`;
    }

    const rest = content.slice(braceIndex + 1);
    const entry = `"${ENABLE_PROPOSED_API_KEY}": ["${extensionId}"]`;
    // `{}`, `{\n}` and `{ // nothing\n}` have nothing but the closing brace left.
    const significant = maskComments(rest).replace(/[\s,]/g, '');
    const isEmptyObject = significant === '' || significant === '}';
    const insertion = isEmptyObject ? `\n\t${entry}\n` : `\n\t${entry},`;

    return content.slice(0, braceIndex + 1) + insertion + rest;
}

/**
 * `true` when `argv.json` allows proposed APIs for this extension. Commented
 * out entries do not count.
 */
export function isExtensionAllowedInArgvJson(extensionId: string = EXTENSION_ID): boolean {
    try {
        const masked = maskComments(fs.readFileSync(getArgvJsonPath(), 'utf8'));
        const keyMatch = new RegExp(`"${ENABLE_PROPOSED_API_KEY}"\\s*:`).exec(masked);
        if (!keyMatch) {
            return false;
        }
        const valueStart = keyMatch.index + keyMatch[0].length;
        const arrayStart = masked.indexOf('[', valueStart);
        const arrayEnd = arrayStart === -1 ? -1 : masked.indexOf(']', arrayStart);
        if (arrayStart === -1 || arrayEnd === -1 || masked.slice(valueStart, arrayStart).trim() !== '') {
            return false;
        }
        return masked.slice(arrayStart + 1, arrayEnd).toLowerCase().includes(`"${extensionId.toLowerCase()}"`);
    } catch {
        return false;
    }
}

export type EnableProposedApiResult = 'added' | 'already-enabled';

/**
 * Allow this extension to use proposed APIs by adding it to `argv.json`.
 * A running application only picks this up after a restart.
 */
export async function addThisExtensionToArgvJson(extensionId: string = EXTENSION_ID): Promise<EnableProposedApiResult> {
    const argvJsonPath = getArgvJsonPath();
    let content = '';
    try {
        content = await fs.promises.readFile(argvJsonPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }

    if (isExtensionAllowedInArgvJson(extensionId)) {
        return 'already-enabled';
    }

    const updated = addEnableProposedApiEntry(content, extensionId);
    if (!isValidJsonc(updated)) {
        throw new Error(`Refusing to write an invalid ${argvJsonPath}.`);
    }

    await fs.promises.mkdir(path.dirname(argvJsonPath), { recursive: true });
    await fs.promises.writeFile(argvJsonPath, updated, 'utf8');
    return 'added';
}

/** Parse JSONC content (comments and trailing commas are allowed). */
function parseJsonc(content: string): unknown {
    return JSON.parse(maskComments(content).replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Index of the bracket that closes the one at `start`, skipping string
 * literals. Returns `-1` when the document ends first.
 */
function findMatchingBracket(text: string, start: number, open: string, close: string): number {
    let depth = 0;
    let inString = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (char === '\\') {
                i++;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === open) {
            depth++;
        } else if (char === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Path of the *user* `product.json` of the running application, i.e. the one
 * VSCodium merges over its own `product.json`:
 *
 * - macOS: `~/Library/Application Support/<nameShort>/product.json`
 * - Linux: `${XDG_CONFIG_HOME:-~/.config}/<nameShort>/product.json`
 * - Windows: `%APPDATA%\<nameShort>\product.json`
 *
 * `undefined` in portable mode (the data dir lives next to the executable
 * there) and when the application name cannot be determined.
 */
export function getUserProductJsonPath(): string | undefined {
    if (process.env.VSCODE_PORTABLE) {
        return undefined;
    }

    const product = readProductJson();
    const name = product.nameShort || vscode.env.appName;
    if (!name) {
        return undefined;
    }

    let appDataPath: string;
    switch (process.platform) {
        case 'darwin':
            appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
            break;
        case 'win32':
            appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
            break;
        default:
            appDataPath = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
            break;
    }

    return path.join(appDataPath, name, 'product.json');
}

/**
 * `true` when the running application merges a user `product.json`.
 * Only VSCodium patches that in (`patches/00-settings-user-product.patch`);
 * stock VS Code and other forks silently ignore the file.
 */
export function supportsUserProductJson(): boolean {
    const product = readProductJson();
    const identity = `${product.nameShort ?? ''} ${product.nameLong ?? ''} ${vscode.env.appName ?? ''}`;
    return /codium/i.test(identity) && getUserProductJsonPath() !== undefined;
}

/**
 * `true` when the user `product.json` allow-lists this extension for the
 * `resolvers` proposal.
 */
export function isExtensionAllowedInUserProduct(
    extensionId: string = EXTENSION_ID,
    filePath: string | undefined = getUserProductJsonPath()
): boolean {
    if (!filePath) {
        return false;
    }

    try {
        const parsed = parseJsonc(fs.readFileSync(filePath, 'utf8')) as
            Record<string, Record<string, unknown> | undefined> | undefined;
        const allowList = parsed?.[ENABLE_PROPOSED_API_PRODUCT_KEY];
        if (!allowList || typeof allowList !== 'object') {
            return false;
        }

        const entry = Object.entries(allowList)
            .find(([key]) => key.toLowerCase() === extensionId.toLowerCase())?.[1];
        return Array.isArray(entry) && entry.includes(RESOLVERS_PROPOSAL);
    } catch {
        return false;
    }
}

/**
 * Add `extensionId` to the `extensionEnabledApiProposals` map of a user
 * `product.json`, keeping comments and formatting of the surrounding
 * document intact. Returns the unchanged content when the entry is present.
 */
export function addEnableProposedApiEntryToUserProduct(
    content: string,
    extensionId: string = EXTENSION_ID,
    proposal: string = RESOLVERS_PROPOSAL
): string {
    // VSCodium `require()`s the file, so comments would make it unloadable.
    if (maskComments(content) !== content) {
        throw new Error('contains comments, which the application cannot load - remove them first.');
    }

    const entry = `"${extensionId}": ["${proposal}"]`;
    const keyMatch = new RegExp(`"${ENABLE_PROPOSED_API_PRODUCT_KEY}"\\s*:`).exec(content);

    if (keyMatch) {
        const valueStart = keyMatch.index + keyMatch[0].length;
        const objectStart = content.indexOf('{', valueStart);
        // Only whitespace may sit between the key and its object; otherwise
        // the value is something we do not understand and must not rewrite.
        if (objectStart === -1 || content.slice(valueStart, objectStart).trim() !== '') {
            throw new Error(`Malformed "${ENABLE_PROPOSED_API_PRODUCT_KEY}" entry.`);
        }

        const objectEnd = findMatchingBracket(content, objectStart, '{', '}');
        if (objectEnd === -1) {
            throw new Error(`Unterminated "${ENABLE_PROPOSED_API_PRODUCT_KEY}" object.`);
        }
        if (content.slice(objectStart, objectEnd).toLowerCase().includes(`"${extensionId.toLowerCase()}"`)) {
            return content;
        }

        const body = content.slice(objectStart + 1, objectEnd);
        const trimmed = body.replace(/\s+$/, '');
        const isEmpty = trimmed.trim().length === 0;
        const insertion = isEmpty ? `\n\t\t${entry}\n\t` : `${trimmed.endsWith(',') ? ' ' : ', '}${entry}`;
        const cut = objectStart + 1 + trimmed.length;
        return content.slice(0, cut) + insertion + content.slice(cut);
    }

    const block = `"${ENABLE_PROPOSED_API_PRODUCT_KEY}": {\n\t\t${entry}\n\t}`;
    const braceIndex = content.indexOf('{');
    if (braceIndex === -1) {
        return `{\n\t${block}\n}\n`;
    }

    const rest = content.slice(braceIndex + 1);
    // `{}`, `{\n}` and `{ // nothing\n}` have nothing but the closing brace left.
    const significant = maskComments(rest).replace(/[\s,]/g, '');
    const isEmptyObject = significant === '' || significant === '}';
    const insertion = isEmptyObject ? `\n\t${block}\n` : `\n\t${block},`;

    return content.slice(0, braceIndex + 1) + insertion + rest;
}

async function writeUserProductEntry(filePath: string, extensionId: string): Promise<'added' | 'already-enabled'> {
    let content = '';
    try {
        content = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }

    if (isExtensionAllowedInUserProduct(extensionId, filePath)) {
        return 'already-enabled';
    }

    const updated = addEnableProposedApiEntryToUserProduct(content, extensionId);
    if (updated !== content && !isValidJsonc(updated)) {
        throw new Error(`Refusing to write an invalid ${filePath}.`);
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, updated, 'utf8');
    return 'added';
}

export type ProposedApiTarget = 'product.json' | 'argv.json';

export interface ProposedApiTargetInfo {
    readonly target: ProposedApiTarget;
    readonly path: string;
}

export interface EnableProposedApiOutcome extends ProposedApiTargetInfo {
    readonly status: 'added' | 'already-enabled';
}

/**
 * Where a proposed-API entry has to go for the running application: its user
 * `product.json` when the application supports one, `argv.json` otherwise.
 */
export function getProposedApiTarget(): ProposedApiTargetInfo {
    const userProductJsonPath = supportsUserProductJson() ? getUserProductJsonPath() : undefined;
    return userProductJsonPath
        ? { target: 'product.json', path: userProductJsonPath }
        : { target: 'argv.json', path: getArgvJsonPath() };
}

/**
 * Allow this extension to use proposed APIs, wherever the running application
 * expects the entry. A restart is required either way, because both files are
 * only read at process start.
 */
export async function allowProposedApi(extensionId: string = EXTENSION_ID): Promise<EnableProposedApiOutcome> {
    const { target, path: filePath } = getProposedApiTarget();
    const status = target === 'product.json'
        ? await writeUserProductEntry(filePath, extensionId)
        : await addThisExtensionToArgvJson(extensionId);

    return { status, target, path: filePath };
}
