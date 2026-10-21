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
 * extension has to ask the user to allow it explicitly through
 * `argv.json`:
 *
 * ```json
 * {
 *     "enable-proposed-api": ["ai-nikolai.open-remote-ssh-copy"]
 * }
 * ```
 *
 * Everything in here is written so that a missing proposed API can never
 * break the extension: it is detected, reported in a actionable way and the
 * rest of the extension keeps working.
 */

export const EXTENSION_ID = 'ai-nikolai.open-remote-ssh-copy';

const ENABLE_PROPOSED_API_KEY = 'enable-proposed-api';

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
    try {
        const productJsonPath = path.join(vscode.env.appRoot, 'product.json');
        const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8')) as { dataFolderName?: string };
        if (product.dataFolderName) {
            return product.dataFolderName;
        }
    } catch {
        // Fall through to the heuristics below.
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
