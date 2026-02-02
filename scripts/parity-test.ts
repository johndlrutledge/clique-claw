/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseWorkflowStatus, setWorkspaceRoot, updateWorkflowItemStatus } from '../src/core/workflowParser';
import { parseSprintStatus, setSprintWorkspaceRoot, updateStoryStatus } from '../src/core/sprintParser';
import { isInsideWorkspace } from '../src/core/pathValidation';
import { SprintData, StoryStatus, WorkflowData } from '../src/core/types';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type WasmAdapter = {
    parseWorkflowStatus: (yaml: string) => WorkflowData | null;
    parseSprintStatus: (yaml: string) => SprintData | null;
    updateWorkflowStatus: (content: string, itemId: string, newStatus: string) => string;
    updateStoryStatus: (content: string, storyId: string, newStatus: StoryStatus) => string;
    isInsideWorkspace: (filePath: string, workspaceRoot: string) => boolean;
};

const fixturesDir = path.resolve(__dirname, '..', 'src', '__tests__', 'fixtures');
const expectedDir = path.join(fixturesDir, 'expected');

function stableStringify(value: JsonValue): string {
    return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.map(sortDeep) as JsonValue;
    }
    if (value && typeof value === 'object') {
        const sorted: Record<string, JsonValue> = {};
        for (const key of Object.keys(value as Record<string, JsonValue>).sort()) {
            sorted[key] = sortDeep((value as Record<string, JsonValue>)[key]);
        }
        return sorted;
    }
    return value;
}

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, '\n');
}

function assertEqual(name: string, actual: string, expected: string): void {
    if (actual !== expected) {
        throw new Error(`Mismatch: ${name}`);
    }
}

function assertTruthy(name: string, value: unknown): void {
    if (!value) {
        throw new Error(`Expected truthy value: ${name}`);
    }
}

function readFixture(fixtureName: string): string {
    return fs.readFileSync(path.join(fixturesDir, fixtureName), 'utf-8');
}

function readExpected(expectedName: string): string {
    return fs.readFileSync(path.join(expectedDir, expectedName), 'utf-8');
}

function readExpectedJson(expectedName: string): JsonValue {
    return JSON.parse(readExpected(expectedName)) as JsonValue;
}

function writeTempFile(root: string, relativePath: string, content: string): string {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

function getParseWorkflowTs(root: string, fixtureName: string): WorkflowData | null {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    setWorkspaceRoot(root);
    return parseWorkflowStatus(tempPath);
}

function getParseSprintTs(root: string, fixtureName: string): SprintData | null {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    setSprintWorkspaceRoot(root);
    return parseSprintStatus(tempPath);
}

function updateWorkflowTs(root: string, fixtureName: string, itemId: string, newStatus: string): string {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    setWorkspaceRoot(root);
    const ok = updateWorkflowItemStatus(tempPath, itemId, newStatus);
    assertTruthy(`updateWorkflowItemStatus(${fixtureName})`, ok);
    return fs.readFileSync(tempPath, 'utf-8');
}

function updateStoryTs(root: string, fixtureName: string, storyId: string, newStatus: StoryStatus): string {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    setSprintWorkspaceRoot(root);
    const ok = updateStoryStatus(tempPath, storyId, newStatus);
    assertTruthy(`updateStoryStatus(${fixtureName})`, ok);
    return fs.readFileSync(tempPath, 'utf-8');
}

function normalizeWasmResult<T>(value: T): T | JsonValue {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as JsonValue;
        } catch {
            return value as T;
        }
    }
    return value as T;
}

async function loadWasmAdapter(): Promise<WasmAdapter> {
    const modulePath = process.env.CLIQUE_WASM_MODULE
        ?? path.resolve(process.cwd(), 'dist', 'wasm', 'clique_wasm.js');

    if (!fs.existsSync(modulePath)) {
        throw new Error(`WASM module not found at ${modulePath}`);
    }

    const wasmModule = await import(modulePath);

    const required = [
        'parse_workflow_status_wasm',
        'parse_sprint_status_wasm',
        'update_workflow_status_wasm',
        'update_story_status_wasm',
        'is_inside_workspace_wasm'
    ];

    for (const fn of required) {
        if (typeof (wasmModule as Record<string, unknown>)[fn] !== 'function') {
            throw new Error(`Missing WASM export: ${fn}`);
        }
    }

    return {
        parseWorkflowStatus: (yaml: string) => normalizeWasmResult(
            (wasmModule as Record<string, (arg: string) => unknown>).parse_workflow_status_wasm(yaml)
        ) as WorkflowData | null,
        parseSprintStatus: (yaml: string) => normalizeWasmResult(
            (wasmModule as Record<string, (arg: string) => unknown>).parse_sprint_status_wasm(yaml)
        ) as SprintData | null,
        updateWorkflowStatus: (content: string, itemId: string, newStatus: string) =>
            String((wasmModule as Record<string, (...args: string[]) => unknown>)
                .update_workflow_status_wasm(content, itemId, newStatus)),
        updateStoryStatus: (content: string, storyId: string, newStatus: StoryStatus) =>
            String((wasmModule as Record<string, (...args: string[]) => unknown>)
                .update_story_status_wasm(content, storyId, newStatus)),
        isInsideWorkspace: (filePath: string, workspaceRoot: string) =>
            Boolean((wasmModule as Record<string, (...args: string[]) => unknown>)
                .is_inside_workspace_wasm(filePath, workspaceRoot))
    };
}

async function runParityTests(): Promise<void> {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clique-parity-'));
    const wasm = await loadWasmAdapter();

    const workflowParseCases = [
        { name: 'workflow-new', fixture: 'workflow-new.yaml', expected: 'workflow-new.json' },
        { name: 'workflow-flat', fixture: 'workflow-flat.yaml', expected: 'workflow-flat.json' },
        { name: 'workflow-old', fixture: 'workflow-old.yaml', expected: 'workflow-old.json' }
    ];

    for (const testCase of workflowParseCases) {
        const expected = readExpectedJson(testCase.expected);
        const tsResult = getParseWorkflowTs(tempRoot, testCase.fixture);
        const wasmResult = wasm.parseWorkflowStatus(readFixture(testCase.fixture));

        assertTruthy(`${testCase.name} tsResult`, tsResult);
        assertTruthy(`${testCase.name} wasmResult`, wasmResult);

        const expectedJson = stableStringify(expected);
        assertEqual(`${testCase.name} ts`, stableStringify(tsResult as unknown as JsonValue), expectedJson);
        assertEqual(`${testCase.name} wasm`, stableStringify(wasmResult as unknown as JsonValue), expectedJson);
    }

    const sprintExpected = readExpectedJson('sprint-status.json');
    const sprintTs = getParseSprintTs(tempRoot, 'sprint-status.yaml');
    const sprintWasm = wasm.parseSprintStatus(readFixture('sprint-status.yaml'));

    assertTruthy('sprint-status tsResult', sprintTs);
    assertTruthy('sprint-status wasmResult', sprintWasm);

    const sprintExpectedJson = stableStringify(sprintExpected);
    assertEqual('sprint-status ts', stableStringify(sprintTs as unknown as JsonValue), sprintExpectedJson);
    assertEqual('sprint-status wasm', stableStringify(sprintWasm as unknown as JsonValue), sprintExpectedJson);

    const workflowUpdateCases = [
        {
            name: 'workflow-update-new',
            fixture: 'workflow-update-new.yaml',
            expected: 'workflow-update-new.yaml',
            itemId: 'prd',
            newStatus: 'complete'
        },
        {
            name: 'workflow-update-flat',
            fixture: 'workflow-update-flat.yaml',
            expected: 'workflow-update-flat.yaml',
            itemId: 'prd',
            newStatus: 'docs/prd.md'
        },
        {
            name: 'workflow-update-old',
            fixture: 'workflow-update-old.yaml',
            expected: 'workflow-update-old.yaml',
            itemId: 'prd',
            newStatus: 'complete'
        }
    ];

    for (const testCase of workflowUpdateCases) {
        const expected = normalizeNewlines(readExpected(testCase.expected));
        const tsUpdated = normalizeNewlines(updateWorkflowTs(tempRoot, testCase.fixture, testCase.itemId, testCase.newStatus));
        const wasmUpdated = normalizeNewlines(wasm.updateWorkflowStatus(readFixture(testCase.fixture), testCase.itemId, testCase.newStatus));

        assertEqual(`${testCase.name} ts`, tsUpdated, expected);
        assertEqual(`${testCase.name} wasm`, wasmUpdated, expected);
    }

    const sprintUpdateExpected = normalizeNewlines(readExpected('sprint-update.yaml'));
    const sprintUpdateTs = normalizeNewlines(updateStoryTs(tempRoot, 'sprint-update.yaml', '1-story-one', 'done'));
    const sprintUpdateWasm = normalizeNewlines(
        wasm.updateStoryStatus(readFixture('sprint-update.yaml'), '1-story-one', 'done')
    );

    assertEqual('sprint-update ts', sprintUpdateTs, sprintUpdateExpected);
    assertEqual('sprint-update wasm', sprintUpdateWasm, sprintUpdateExpected);

    const pathCases = readExpectedJson('path-validation.json') as Array<{ name: string; filePath: string; expected: boolean }>;

    for (const testCase of pathCases) {
        const absolutePath = path.resolve(tempRoot, testCase.filePath);
        const tsResult = isInsideWorkspace(absolutePath, tempRoot);
        const wasmResult = wasm.isInsideWorkspace(absolutePath, tempRoot);

        if (tsResult !== testCase.expected) {
            throw new Error(`Path validation mismatch (ts): ${testCase.name}`);
        }
        if (wasmResult !== testCase.expected) {
            throw new Error(`Path validation mismatch (wasm): ${testCase.name}`);
        }
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
}

runParityTests().catch((error) => {
    console.error(error);
    process.exit(1);
});
