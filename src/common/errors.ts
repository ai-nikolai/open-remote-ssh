/**
 * Turn an `unknown` thrown value into something that can be shown to the user.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : JSON.stringify(error);
}
