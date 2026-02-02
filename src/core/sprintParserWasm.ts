// src/core/sprintParserWasm.ts
/**
 * WASM-based Sprint Parser
 * 
 * This module provides sprint parsing using the Rust/WASM core.
 * File I/O remains in TypeScript; parsing logic is in WASM.
 * 
 * API is identical to sprintParser.ts for seamless integration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SprintData, StoryStatus } from './types';
import { getWasmModule, isWasmLoaded, getWasmModuleSync } from './wasmLoader';

// Workspace root for path validation (set via setSprintWorkspaceRoot)
let workspaceRoot: string | null = null;

/**
 * Set the workspace root for path validation
 */
export function setSprintWorkspaceRoot(root: string | null): void {
    workspaceRoot = root;
}

/**
 * Get the current workspace root
 */
export function getSprintWorkspaceRoot(): string | null {
    return workspaceRoot;
}

/**
 * Check if a path is inside the workspace using WASM validation
 */
async function isInsideWorkspaceAsync(filePath: string, wsRoot: string): Promise<boolean> {
    try {
        const wasm = await getWasmModule();
        return wasm.isInsideWorkspace(filePath, wsRoot);
    } catch {
        return false;
    }
}

/**
 * Check if a path is inside the workspace (sync version)
 * Falls back to simple prefix check if WASM not loaded
 */
function isInsideWorkspaceSync(filePath: string, wsRoot: string): boolean {
    if (isWasmLoaded()) {
        return getWasmModuleSync().isInsideWorkspace(filePath, wsRoot);
    }
    // Fallback: simple normalized path comparison
    const normalizedFile = path.resolve(filePath).toLowerCase();
    const normalizedRoot = path.resolve(wsRoot).toLowerCase();
    return normalizedFile.startsWith(normalizedRoot + path.sep) || normalizedFile === normalizedRoot;
}

/**
 * Parse sprint status from a file using WASM
 * 
 * @param filePath Path to the sprint status YAML file
 * @returns Parsed SprintData or null on error
 */
export function parseSprintStatus(filePath: string): SprintData | null {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !isInsideWorkspaceSync(filePath, workspaceRoot)) {
        console.error('Path validation failed: file outside workspace');
        return null;
    }

    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Use sync WASM if loaded, otherwise return null
        if (isWasmLoaded()) {
            const wasm = getWasmModuleSync();
            return wasm.parseSprintStatus(content);
        }
        
        // Fallback: can't use async in sync function
        console.warn('WASM not loaded yet. Call getWasmModule() during extension activation.');
        return null;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse sprint status: ${message}`);
        return null;
    }
}

/**
 * Parse sprint status asynchronously (ensures WASM is loaded)
 * 
 * @param filePath Path to the sprint status YAML file
 * @returns Promise resolving to parsed SprintData or null on error
 */
export async function parseSprintStatusAsync(filePath: string): Promise<SprintData | null> {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !(await isInsideWorkspaceAsync(filePath, workspaceRoot))) {
        console.error('Path validation failed: file outside workspace');
        return null;
    }

    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const wasm = await getWasmModule();
        return wasm.parseSprintStatus(content);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse sprint status: ${message}`);
        return null;
    }
}

/**
 * Update a story's status using WASM
 * 
 * @param filePath Path to the sprint status file
 * @param storyId Story ID to update
 * @param newStatus New status value
 * @returns True if update succeeded
 */
export function updateStoryStatus(filePath: string, storyId: string, newStatus: StoryStatus): boolean {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !isInsideWorkspaceSync(filePath, workspaceRoot)) {
        console.error('Path validation failed: file outside workspace');
        return false;
    }

    if (!fs.existsSync(filePath)) {
        return false;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        if (!isWasmLoaded()) {
            console.error('WASM not loaded. Call getWasmModule() first.');
            return false;
        }
        
        const wasm = getWasmModuleSync();
        const updatedContent = wasm.updateStoryStatus(content, storyId, newStatus);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update story status: ${message}`);
        return false;
    }
}

/**
 * Update a story's status asynchronously
 * 
 * @param filePath Path to the sprint status file
 * @param storyId Story ID to update
 * @param newStatus New status value
 * @returns Promise resolving to true if update succeeded
 */
export async function updateStoryStatusAsync(
    filePath: string,
    storyId: string,
    newStatus: StoryStatus
): Promise<boolean> {
    // Security: Validate path is inside workspace
    if (workspaceRoot && !(await isInsideWorkspaceAsync(filePath, workspaceRoot))) {
        console.error('Path validation failed: file outside workspace');
        return false;
    }

    if (!fs.existsSync(filePath)) {
        return false;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const wasm = await getWasmModule();
        const updatedContent = wasm.updateStoryStatus(content, storyId, newStatus);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update story status: ${message}`);
        return false;
    }
}

/**
 * Find all sprint status files in the workspace
 * 
 * @param wsRoot Workspace root path
 * @returns Array of paths to sprint status files
 */
export function findAllSprintStatusFiles(wsRoot: string): string[] {
    const results: string[] = [];

    function searchDir(dir: string): void {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
                    searchDir(fullPath);
                } else if (entry.isFile() && entry.name === 'sprint-status.yaml') {
                    results.push(fullPath);
                }
            }
        } catch {
            // Ignore permission errors
        }
    }

    searchDir(wsRoot);
    return results;
}
