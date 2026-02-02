// src/core/wasmLoader.ts
/**
 * WASM Module Loader for Clique
 * 
 * Provides lazy initialization and caching of the Rust/WASM module.
 * All WASM functions are exposed through a typed interface.
 */

import * as path from 'path';
import * as fs from 'fs';
import { WorkflowData, SprintData, StoryStatus } from './types';

/**
 * Raw WASM module exports from clique_wasm.js
 */
interface WasmModuleExports {
    parse_workflow_status_wasm(yaml_content: string): unknown;
    parse_sprint_status_wasm(yaml_content: string): unknown;
    update_workflow_status_wasm(content: string, item_id: string, new_status: string): string;
    update_story_status_wasm(content: string, story_id: string, new_status: string): string;
    is_inside_workspace_wasm(file_path: string, workspace_root: string): boolean;
}

/**
 * Typed interface for the Clique WASM module
 */
export interface CliqueWasm {
    /**
     * Parse workflow status from YAML content
     * @param yaml YAML content string
     * @returns Parsed WorkflowData or throws on error
     */
    parseWorkflowStatus(yaml: string): WorkflowData;
    
    /**
     * Parse sprint status from YAML content
     * @param yaml YAML content string
     * @returns Parsed SprintData or throws on error
     */
    parseSprintStatus(yaml: string): SprintData;
    
    /**
     * Update workflow item status in YAML content
     * @param content Original YAML content
     * @param itemId Workflow item ID to update
     * @param newStatus New status value
     * @returns Updated YAML content or throws on error
     */
    updateWorkflowStatus(content: string, itemId: string, newStatus: string): string;
    
    /**
     * Update story status in YAML content
     * @param content Original YAML content
     * @param storyId Story ID to update
     * @param newStatus New status value
     * @returns Updated YAML content or throws on error
     */
    updateStoryStatus(content: string, storyId: string, newStatus: StoryStatus): string;
    
    /**
     * Check if a file path is inside the workspace root
     * @param filePath Path to check
     * @param workspaceRoot Workspace root path
     * @returns True if path is inside workspace
     */
    isInsideWorkspace(filePath: string, workspaceRoot: string): boolean;
}

// Cached WASM module instance
let wasmModuleCache: CliqueWasm | null = null;
let wasmLoadPromise: Promise<CliqueWasm> | null = null;
let wasmLoadError: Error | null = null;

// Performance metrics
let wasmLoadTimeMs: number | null = null;

function normalizeWasmError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Get the path to the WASM module
 */
function getWasmModulePath(): string {
    // Check environment variable first (for tests)
    if (process.env.CLIQUE_WASM_MODULE) {
        return process.env.CLIQUE_WASM_MODULE;
    }
    
    // Try to resolve relative to this module's location
    // In bundled extension: dist/extension.js -> dist/wasm/clique_wasm.js
    const distWasmPath = path.resolve(__dirname, 'wasm', 'clique_wasm.js');
    if (fs.existsSync(distWasmPath)) {
        return distWasmPath;
    }
    
    // Fallback: from project root during development
    const devWasmPath = path.resolve(__dirname, '..', '..', 'dist', 'wasm', 'clique_wasm.js');
    if (fs.existsSync(devWasmPath)) {
        return devWasmPath;
    }
    
    // Final fallback: use cwd-relative path
    return path.resolve(process.cwd(), 'dist', 'wasm', 'clique_wasm.js');
}

/**
 * Create a typed wrapper around the raw WASM exports
 */
function createWasmWrapper(rawModule: WasmModuleExports): CliqueWasm {
    return {
        parseWorkflowStatus(yaml: string): WorkflowData {
            const result = rawModule.parse_workflow_status_wasm(yaml);
            if (typeof result === 'string') {
                return JSON.parse(result) as WorkflowData;
            }
            return result as WorkflowData;
        },
        
        parseSprintStatus(yaml: string): SprintData {
            const result = rawModule.parse_sprint_status_wasm(yaml);
            if (typeof result === 'string') {
                return JSON.parse(result) as SprintData;
            }
            return result as SprintData;
        },
        
        updateWorkflowStatus(content: string, itemId: string, newStatus: string): string {
            return rawModule.update_workflow_status_wasm(content, itemId, newStatus);
        },
        
        updateStoryStatus(content: string, storyId: string, newStatus: StoryStatus): string {
            return rawModule.update_story_status_wasm(content, storyId, newStatus);
        },
        
        isInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
            return rawModule.is_inside_workspace_wasm(filePath, workspaceRoot);
        }
    };
}

/**
 * Load the WASM module asynchronously
 */
async function loadWasmModule(): Promise<CliqueWasm> {
    const startTime = performance.now();
    const modulePath = getWasmModulePath();
    
    if (!fs.existsSync(modulePath)) {
        throw new Error(`WASM module not found at ${modulePath}. Run 'wasm-pack build' first.`);
    }
    
    try {
        // Dynamic import of the WASM module
        const rawModule = await import(modulePath) as WasmModuleExports;
        
        // Validate exports
        const requiredExports = [
            'parse_workflow_status_wasm',
            'parse_sprint_status_wasm',
            'update_workflow_status_wasm',
            'update_story_status_wasm',
            'is_inside_workspace_wasm'
        ];
        
        for (const exportName of requiredExports) {
            if (typeof (rawModule as unknown as Record<string, unknown>)[exportName] !== 'function') {
                throw new Error(`Missing WASM export: ${exportName}`);
            }
        }
        
        wasmLoadTimeMs = performance.now() - startTime;
        console.log(`Clique WASM module loaded in ${wasmLoadTimeMs.toFixed(2)}ms`);
        
        return createWasmWrapper(rawModule);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load WASM module: ${message}`);
    }
}

/**
 * Get the WASM module (lazy initialization with caching)
 * 
 * The first call will load the module; subsequent calls return the cached instance.
 * Thread-safe: concurrent calls will share the same loading promise.
 * 
 * @returns Promise resolving to the WASM module
 * @throws Error if WASM module cannot be loaded
 */
export async function getWasmModule(): Promise<CliqueWasm> {
    // Return cached module if available
    if (wasmModuleCache) {
        return wasmModuleCache;
    }
    
    // Re-throw cached error if previous load failed
    if (wasmLoadError) {
        throw wasmLoadError;
    }
    
    // Share loading promise for concurrent calls
    if (wasmLoadPromise) {
        return wasmLoadPromise.catch(error => {
            const normalized = normalizeWasmError(error);
            wasmLoadError = normalized;
            wasmLoadPromise = null;
            throw normalized;
        });
    }
    
    wasmLoadPromise = loadWasmModule()
        .then(module => {
            wasmModuleCache = module;
            wasmLoadPromise = null;
            return module;
        })
        .catch(error => {
            const normalized = normalizeWasmError(error);
            wasmLoadError = normalized;
            wasmLoadPromise = null;
            throw normalized;
        });
    
    return wasmLoadPromise;
}

/**
 * Get the WASM module synchronously (throws if not loaded)
 * 
 * Use this only after ensuring the module is loaded via getWasmModule().
 * 
 * @returns The cached WASM module
 * @throws Error if module is not yet loaded
 */
export function getWasmModuleSync(): CliqueWasm {
    if (!wasmModuleCache) {
        throw new Error('WASM module not loaded. Call getWasmModule() first.');
    }
    return wasmModuleCache;
}

/**
 * Check if WASM module is available and can be loaded
 * 
 * @returns Promise resolving to true if WASM is available
 */
export async function isWasmAvailable(): Promise<boolean> {
    try {
        await getWasmModule();
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if WASM module is currently loaded
 * 
 * @returns True if module is loaded and cached
 */
export function isWasmLoaded(): boolean {
    return wasmModuleCache !== null;
}

/**
 * Get the WASM module load time in milliseconds
 * 
 * @returns Load time in ms, or null if not yet loaded
 */
export function getWasmLoadTime(): number | null {
    return wasmLoadTimeMs;
}

/**
 * Reset the WASM module cache (primarily for testing)
 */
export function resetWasmCache(): void {
    wasmModuleCache = null;
    wasmLoadPromise = null;
    wasmLoadError = null;
    wasmLoadTimeMs = null;
}

export function __setWasmLoadPromiseForTests(promise: Promise<CliqueWasm> | null): void {
    wasmLoadPromise = promise;
}
