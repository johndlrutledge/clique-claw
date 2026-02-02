// scripts/perf-bench.ts
/**
 * Performance Benchmarks
 *
 * Measures TS vs WASM parse/update performance using fixture data.
 * Run with: npx ts-node scripts/perf-bench.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { performance } from 'perf_hooks';

import {
    parseWorkflowStatus as parseWorkflowStatusTs,
    updateWorkflowItemStatus as updateWorkflowItemStatusTs,
    setWorkspaceRoot as setWorkflowRootTs
} from '../src/core/workflowParser';

import {
    parseSprintStatus as parseSprintStatusTs,
    updateStoryStatus as updateStoryStatusTs,
    setSprintWorkspaceRoot as setSprintRootTs
} from '../src/core/sprintParser';

import {
    parseWorkflowStatus as parseWorkflowStatusWasm,
    updateWorkflowItemStatus as updateWorkflowItemStatusWasm,
    setWorkspaceRoot as setWorkflowRootWasm
} from '../src/core/workflowParserWasm';

import {
    parseSprintStatus as parseSprintStatusWasm,
    updateStoryStatus as updateStoryStatusWasm,
    setSprintWorkspaceRoot as setSprintRootWasm
} from '../src/core/sprintParserWasm';

import {
    getWasmModule,
    getWasmLoadTime,
    resetWasmCache
} from '../src/core/wasmLoader';

const fixturesDir = path.resolve(__dirname, '..', 'src', '__tests__', 'fixtures');

function readFixture(name: string): string {
    return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

function createTempWorkspace(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'clique-bench-'));
}

function cleanupTempDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeTempFile(root: string, relativePath: string, content: string): string {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

function formatMs(value: number): string {
    return `${value.toFixed(2)} ms`;
}

function formatMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function benchSync(label: string, iterations: number, fn: () => void): { label: string; totalMs: number; avgMs: number } {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const totalMs = performance.now() - start;
    return { label, totalMs, avgMs: totalMs / iterations };
}

async function runBenchmarks(): Promise<void> {
    const iterations = Number(process.env.CLIQUE_BENCH_ITERATIONS ?? 200);
    const workspace = createTempWorkspace();

    try {
        const workflowContent = readFixture('workflow-new.yaml');
        const sprintContent = readFixture('sprint-status.yaml');
        const workflowUpdateContent = readFixture('workflow-update-new.yaml');
        const sprintUpdateContent = readFixture('sprint-update.yaml');

        const workflowPath = writeTempFile(workspace, 'workflow.yaml', workflowContent);
        const sprintPath = writeTempFile(workspace, 'sprint-status.yaml', sprintContent);
        const workflowUpdatePath = writeTempFile(workspace, 'workflow-update.yaml', workflowUpdateContent);
        const sprintUpdatePath = writeTempFile(workspace, 'sprint-update.yaml', sprintUpdateContent);

        setWorkflowRootTs(workspace);
        setSprintRootTs(workspace);
        setWorkflowRootWasm(workspace);
        setSprintRootWasm(workspace);

        resetWasmCache();
        await getWasmModule();
        const wasmLoadTime = getWasmLoadTime();

        console.log('=== Clique Performance Benchmarks ===');
        console.log(`Iterations: ${iterations}`);
        if (wasmLoadTime !== null) {
            console.log(`WASM load time: ${formatMs(wasmLoadTime)}`);
        }

        const memBefore = process.memoryUsage().rss;

        const results = [
            benchSync('Workflow parse (TS)', iterations, () => {
                parseWorkflowStatusTs(workflowPath);
            }),
            benchSync('Workflow parse (WASM)', iterations, () => {
                parseWorkflowStatusWasm(workflowPath);
            }),
            benchSync('Sprint parse (TS)', iterations, () => {
                parseSprintStatusTs(sprintPath);
            }),
            benchSync('Sprint parse (WASM)', iterations, () => {
                parseSprintStatusWasm(sprintPath);
            }),
            benchSync('Workflow update (TS)', iterations, () => {
                fs.writeFileSync(workflowUpdatePath, workflowUpdateContent, 'utf-8');
                updateWorkflowItemStatusTs(workflowUpdatePath, 'prd', 'skipped');
            }),
            benchSync('Workflow update (WASM)', iterations, () => {
                fs.writeFileSync(workflowUpdatePath, workflowUpdateContent, 'utf-8');
                updateWorkflowItemStatusWasm(workflowUpdatePath, 'prd', 'skipped');
            }),
            benchSync('Story update (TS)', iterations, () => {
                fs.writeFileSync(sprintUpdatePath, sprintUpdateContent, 'utf-8');
                updateStoryStatusTs(sprintUpdatePath, '1-story-one', 'done');
            }),
            benchSync('Story update (WASM)', iterations, () => {
                fs.writeFileSync(sprintUpdatePath, sprintUpdateContent, 'utf-8');
                updateStoryStatusWasm(sprintUpdatePath, '1-story-one', 'done');
            })
        ];

        const memAfter = process.memoryUsage().rss;

        console.log('\nResults:');
        for (const result of results) {
            console.log(`- ${result.label}: avg ${formatMs(result.avgMs)} (total ${formatMs(result.totalMs)})`);
        }

        console.log('\nMemory:');
        console.log(`- RSS before: ${formatMb(memBefore)}`);
        console.log(`- RSS after:  ${formatMb(memAfter)}`);
    } finally {
        cleanupTempDir(workspace);
    }
}

runBenchmarks().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Benchmark failed: ${message}`);
    process.exit(1);
});
