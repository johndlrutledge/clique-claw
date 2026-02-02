"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="node" />
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const workflowParser_1 = require("../src/core/workflowParser");
const sprintParser_1 = require("../src/core/sprintParser");
const pathValidation_1 = require("../src/core/pathValidation");
const fixturesDir = path.resolve(__dirname, '..', 'src', '__tests__', 'fixtures');
const expectedDir = path.join(fixturesDir, 'expected');
function stableStringify(value) {
    return JSON.stringify(sortDeep(value), null, 2);
}
function sortDeep(value) {
    if (Array.isArray(value)) {
        return value.map(sortDeep);
    }
    if (value && typeof value === 'object') {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortDeep(value[key]);
        }
        return sorted;
    }
    return value;
}
function normalizeNewlines(value) {
    return value.replace(/\r\n/g, '\n');
}
function assertEqual(name, actual, expected) {
    if (actual !== expected) {
        throw new Error(`Mismatch: ${name}`);
    }
}
function assertTruthy(name, value) {
    if (!value) {
        throw new Error(`Expected truthy value: ${name}`);
    }
}
function readFixture(fixtureName) {
    return fs.readFileSync(path.join(fixturesDir, fixtureName), 'utf-8');
}
function readExpected(expectedName) {
    return fs.readFileSync(path.join(expectedDir, expectedName), 'utf-8');
}
function readExpectedJson(expectedName) {
    return JSON.parse(readExpected(expectedName));
}
function writeTempFile(root, relativePath, content) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}
function getParseWorkflowTs(root, fixtureName) {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    (0, workflowParser_1.setWorkspaceRoot)(root);
    return (0, workflowParser_1.parseWorkflowStatus)(tempPath);
}
function getParseSprintTs(root, fixtureName) {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    (0, sprintParser_1.setSprintWorkspaceRoot)(root);
    return (0, sprintParser_1.parseSprintStatus)(tempPath);
}
function updateWorkflowTs(root, fixtureName, itemId, newStatus) {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    (0, workflowParser_1.setWorkspaceRoot)(root);
    const ok = (0, workflowParser_1.updateWorkflowItemStatus)(tempPath, itemId, newStatus);
    assertTruthy(`updateWorkflowItemStatus(${fixtureName})`, ok);
    return fs.readFileSync(tempPath, 'utf-8');
}
function updateStoryTs(root, fixtureName, storyId, newStatus) {
    const content = readFixture(fixtureName);
    const tempPath = writeTempFile(root, fixtureName, content);
    (0, sprintParser_1.setSprintWorkspaceRoot)(root);
    const ok = (0, sprintParser_1.updateStoryStatus)(tempPath, storyId, newStatus);
    assertTruthy(`updateStoryStatus(${fixtureName})`, ok);
    return fs.readFileSync(tempPath, 'utf-8');
}
function normalizeWasmResult(value) {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    return value;
}
async function loadWasmAdapter() {
    const modulePath = process.env.CLIQUE_WASM_MODULE
        ?? path.resolve(process.cwd(), 'dist', 'wasm', 'clique_wasm.js');
    if (!fs.existsSync(modulePath)) {
        throw new Error(`WASM module not found at ${modulePath}`);
    }
    const wasmModule = await Promise.resolve(`${modulePath}`).then(s => __importStar(require(s)));
    const required = [
        'parse_workflow_status_wasm',
        'parse_sprint_status_wasm',
        'update_workflow_status_wasm',
        'update_story_status_wasm',
        'is_inside_workspace_wasm'
    ];
    for (const fn of required) {
        if (typeof wasmModule[fn] !== 'function') {
            throw new Error(`Missing WASM export: ${fn}`);
        }
    }
    return {
        parseWorkflowStatus: (yaml) => normalizeWasmResult(wasmModule.parse_workflow_status_wasm(yaml)),
        parseSprintStatus: (yaml) => normalizeWasmResult(wasmModule.parse_sprint_status_wasm(yaml)),
        updateWorkflowStatus: (content, itemId, newStatus) => String(wasmModule
            .update_workflow_status_wasm(content, itemId, newStatus)),
        updateStoryStatus: (content, storyId, newStatus) => String(wasmModule
            .update_story_status_wasm(content, storyId, newStatus)),
        isInsideWorkspace: (filePath, workspaceRoot) => Boolean(wasmModule
            .is_inside_workspace_wasm(filePath, workspaceRoot))
    };
}
async function runParityTests() {
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
        assertEqual(`${testCase.name} ts`, stableStringify(tsResult), expectedJson);
        assertEqual(`${testCase.name} wasm`, stableStringify(wasmResult), expectedJson);
    }
    const sprintExpected = readExpectedJson('sprint-status.json');
    const sprintTs = getParseSprintTs(tempRoot, 'sprint-status.yaml');
    const sprintWasm = wasm.parseSprintStatus(readFixture('sprint-status.yaml'));
    assertTruthy('sprint-status tsResult', sprintTs);
    assertTruthy('sprint-status wasmResult', sprintWasm);
    const sprintExpectedJson = stableStringify(sprintExpected);
    assertEqual('sprint-status ts', stableStringify(sprintTs), sprintExpectedJson);
    assertEqual('sprint-status wasm', stableStringify(sprintWasm), sprintExpectedJson);
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
    const sprintUpdateWasm = normalizeNewlines(wasm.updateStoryStatus(readFixture('sprint-update.yaml'), '1-story-one', 'done'));
    assertEqual('sprint-update ts', sprintUpdateTs, sprintUpdateExpected);
    assertEqual('sprint-update wasm', sprintUpdateWasm, sprintUpdateExpected);
    const pathCases = readExpectedJson('path-validation.json');
    for (const testCase of pathCases) {
        const absolutePath = path.resolve(tempRoot, testCase.filePath);
        const tsResult = (0, pathValidation_1.isInsideWorkspace)(absolutePath, tempRoot);
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
//# sourceMappingURL=parity-test.js.map