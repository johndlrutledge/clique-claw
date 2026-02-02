// src/core/pathValidationWasm.ts
/**
 * WASM-based Path Validation
 * 
 * This module provides path validation using the Rust/WASM core.
 * API is identical to pathValidation.ts for seamless integration.
 */

import * as path from 'path';
import * as fs from 'fs';
import { getWasmModule, isWasmLoaded, getWasmModuleSync } from './wasmLoader';

/**
 * Validate that a file path is inside the workspace root.
 * Uses WASM for validation when loaded, falls back to TS implementation.
 * 
 * @param filePath Path to validate
 * @param workspaceRoot Workspace root path
 * @returns True if path is inside workspace
 */
export function isInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
    // Use WASM if loaded
    if (isWasmLoaded()) {
        try {
            return getWasmModuleSync().isInsideWorkspace(filePath, workspaceRoot);
        } catch {
            // Fall through to TS implementation
        }
    }
    
    // Fallback: TypeScript implementation
    return isInsideWorkspaceTS(filePath, workspaceRoot);
}

/**
 * Validate that a file path is inside the workspace root (async version)
 * Ensures WASM is loaded before validation.
 * 
 * @param filePath Path to validate
 * @param workspaceRoot Workspace root path
 * @returns Promise resolving to true if path is inside workspace
 */
export async function isInsideWorkspaceAsync(filePath: string, workspaceRoot: string): Promise<boolean> {
    try {
        const wasm = await getWasmModule();
        return wasm.isInsideWorkspace(filePath, workspaceRoot);
    } catch {
        // Fall back to TS implementation
        return isInsideWorkspaceTS(filePath, workspaceRoot);
    }
}

/**
 * Pure TypeScript implementation of path validation
 * Used as fallback when WASM is not available.
 */
function isInsideWorkspaceTS(filePath: string, workspaceRoot: string): boolean {
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
 * 
 * @param filePath Path to validate
 * @param workspaceRoot Workspace root path
 * @returns Resolved file path, or null if outside workspace
 */
export function getValidatedPath(filePath: string, workspaceRoot: string): string | null {
    if (!isInsideWorkspace(filePath, workspaceRoot)) {
        return null;
    }
    return path.resolve(filePath);
}

/**
 * Get validated file path asynchronously
 * 
 * @param filePath Path to validate
 * @param workspaceRoot Workspace root path
 * @returns Promise resolving to resolved file path, or null if outside workspace
 */
export async function getValidatedPathAsync(filePath: string, workspaceRoot: string): Promise<string | null> {
    if (!(await isInsideWorkspaceAsync(filePath, workspaceRoot))) {
        return null;
    }
    return path.resolve(filePath);
}
