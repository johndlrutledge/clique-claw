// src/core/pathValidation.ts
import * as path from 'path';
import * as fs from 'fs';

/**
 * Validate that a file path is inside the workspace root.
 * Resolves symlinks and normalizes paths to prevent path traversal attacks.
 */
export function isInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
    try {
        // Resolve to absolute paths and normalize
        const resolvedFile = path.resolve(filePath);
        const resolvedRoot = path.resolve(workspaceRoot);

        // Resolve symlinks if the file exists
        let realFilePath = resolvedFile;
        let realRootPath = resolvedRoot;

        if (fs.existsSync(resolvedFile)) {
            realFilePath = fs.realpathSync(resolvedFile);
        }
        if (fs.existsSync(resolvedRoot)) {
            realRootPath = fs.realpathSync(resolvedRoot);
        }

        // Normalize for comparison (handle trailing slashes, case on Windows)
        const normalizedFile = path.normalize(realFilePath).toLowerCase();
        const normalizedRoot = path.normalize(realRootPath).toLowerCase();

        // Check if file path starts with workspace root
        return normalizedFile.startsWith(normalizedRoot + path.sep) || 
               normalizedFile === normalizedRoot;
    } catch {
        return false;
    }
}

/**
 * Get validated file path, returns null if path is outside workspace.
 */
export function getValidatedPath(filePath: string, workspaceRoot: string): string | null {
    if (!isInsideWorkspace(filePath, workspaceRoot)) {
        return null;
    }
    return path.resolve(filePath);
}
