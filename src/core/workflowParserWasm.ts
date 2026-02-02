// src/core/workflowParserWasm.ts
/**
 * WASM-based Workflow Parser
 * 
 * This module provides workflow parsing using the Rust/WASM core.
 * File I/O remains in TypeScript; parsing logic is in WASM.
 * 
 * API is identical to workflowParser.ts for seamless integration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { WorkflowData, WorkflowItem } from './types';
import { getWasmModule, isWasmLoaded, getWasmModuleSync } from './wasmLoader';

// Workspace root for path validation (set via setWorkspaceRoot)
let workspaceRoot: string | null = null;

/**
 * Set the workspace root for path validation
 */
export function setWorkspaceRoot(root: string | null): void {
    workspaceRoot = root;
}

/**
 * Get the current workspace root
 */
export function getWorkspaceRoot(): string | null {
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
 * Parse workflow status from a file using WASM
 * 
 * @param filePath Path to the workflow status YAML file
 * @returns Parsed WorkflowData or null on error
 */
export function parseWorkflowStatus(filePath: string): WorkflowData | null {
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
        
        // Use sync WASM if loaded, otherwise load async
        if (isWasmLoaded()) {
            const wasm = getWasmModuleSync();
            return wasm.parseWorkflowStatus(content);
        }
        
        // Fallback: can't use async in sync function, return null
        // The extension should pre-load WASM during activation
        console.warn('WASM not loaded yet. Call getWasmModule() during extension activation.');
        return null;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse workflow status: ${message}`);
        return null;
    }
}

/**
 * Parse workflow status asynchronously (ensures WASM is loaded)
 * 
 * @param filePath Path to the workflow status YAML file
 * @returns Promise resolving to parsed WorkflowData or null on error
 */
export async function parseWorkflowStatusAsync(filePath: string): Promise<WorkflowData | null> {
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
        return wasm.parseWorkflowStatus(content);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse workflow status: ${message}`);
        return null;
    }
}

/**
 * Get workflow items for a specific phase
 * 
 * @param data Parsed workflow data
 * @param phaseNumber Phase number to filter by (0-3 or 'prerequisite')
 * @returns Array of workflow items for the specified phase
 */
export function getItemsForPhase(data: WorkflowData, phaseNumber: number | 'prerequisite'): WorkflowItem[] {
    return data.items.filter(item => item.phase === phaseNumber);
}

/**
 * Find the workflow status file in standard locations
 * 
 * @param wsRoot Workspace root path
 * @returns Path to workflow status file, or null if not found
 */
export function findWorkflowStatusFile(wsRoot: string): string | null {
    const candidates = [
        path.join(wsRoot, '_bmad-output', 'planning-artifacts', 'bmm-workflow-status.yaml'),
        path.join(wsRoot, '_bmad-output', 'bmm-workflow-status.yaml'),
        path.join(wsRoot, 'docs', 'bmm-workflow-status.yaml'),
        path.join(wsRoot, 'bmm-workflow-status.yaml')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Update a workflow item's status using WASM
 * 
 * @param filePath Path to the workflow status file
 * @param itemId Workflow item ID to update
 * @param newStatus New status value
 * @returns True if update succeeded
 */
export function updateWorkflowItemStatus(
    filePath: string,
    itemId: string,
    newStatus: string
): boolean {
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
        const updatedContent = wasm.updateWorkflowStatus(content, itemId, newStatus);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update workflow status: ${message}`);
        return false;
    }
}

/**
 * Update a workflow item's status asynchronously
 * 
 * @param filePath Path to the workflow status file
 * @param itemId Workflow item ID to update
 * @param newStatus New status value
 * @returns Promise resolving to true if update succeeded
 */
export async function updateWorkflowItemStatusAsync(
    filePath: string,
    itemId: string,
    newStatus: string
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
        const updatedContent = wasm.updateWorkflowStatus(content, itemId, newStatus);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to update workflow status: ${message}`);
        return false;
    }
}
