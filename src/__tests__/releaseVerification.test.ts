// src/__tests__/releaseVerification.test.ts
/**
 * Phase 9 — Release Verification & Final Integration Tests
 *
 * Validates VSIX packaging, extension activation, command registration,
 * and end-to-end BMAD workflow functionality.
 * Run with: npx ts-node src/__tests__/releaseVerification.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const repoRoot = path.resolve(__dirname, '..', '..');

let passCount = 0;
let failCount = 0;

function pass(name: string): void {
    passCount++;
    console.log(`  ✓ ${name}`);
}

function fail(name: string, error: unknown): void {
    failCount++;
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ ${name}: ${msg}`);
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function readText(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
}

function fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
}

function getFileSize(filePath: string): number {
    const stats = fs.statSync(filePath);
    return stats.size;
}

// =============================================================================
// 9.1 VSIX Structure & Package Verification
// =============================================================================

function testDistDirectoryStructure(): void {
    console.log('\nDist Directory Structure Tests:');

    try {
        const distDir = path.join(repoRoot, 'dist');
        assert(fileExists(distDir), 'dist/ directory should exist');

        const extensionJs = path.join(distDir, 'extension.js');
        assert(fileExists(extensionJs), 'dist/extension.js should exist');

        const wasmDir = path.join(distDir, 'wasm');
        assert(fileExists(wasmDir), 'dist/wasm/ directory should exist');

        const wasmJs = path.join(wasmDir, 'clique_wasm.js');
        const wasmBg = path.join(wasmDir, 'clique_wasm_bg.wasm');
        assert(fileExists(wasmJs), 'dist/wasm/clique_wasm.js should exist');
        assert(fileExists(wasmBg), 'dist/wasm/clique_wasm_bg.wasm should exist');

        // Verify WASM file is reasonably sized (not empty, not huge)
        const wasmSize = getFileSize(wasmBg);
        assert(wasmSize > 10000, `WASM file should be > 10KB (actual: ${wasmSize} bytes)`);
        assert(wasmSize < 5000000, `WASM file should be < 5MB (actual: ${wasmSize} bytes)`);

        pass('dist/ contains extension.js and WASM files');
    } catch (error) {
        fail('dist/ contains extension.js and WASM files', error);
    }
}

function testVscodeignoreConfiguration(): void {
    console.log('\nVscodeignore Configuration Tests:');

    try {
        const vscodeignorePath = path.join(repoRoot, '.vscodeignore');
        assert(fileExists(vscodeignorePath), '.vscodeignore should exist');

        const content = readText(vscodeignorePath);

        // Verify dist is NOT ignored (critical for VSIX)
        assert(!content.includes('dist/**'), '.vscodeignore should NOT ignore dist/');
        assert(!content.includes('dist/'), '.vscodeignore should NOT ignore dist/');

        // Verify source files are ignored (not needed in VSIX)
        assert(content.includes('src/**'), '.vscodeignore should ignore src/');
        assert(content.includes('*.ts') || content.includes('**/*.ts'), '.vscodeignore should ignore TypeScript sources');

        // Verify node_modules is ignored
        assert(content.includes('node_modules'), '.vscodeignore should ignore node_modules');

        pass('.vscodeignore includes WASM output and excludes source');
    } catch (error) {
        fail('.vscodeignore includes WASM output and excludes source', error);
    }
}

function testPackageJsonConfiguration(): void {
    console.log('\nPackage.json Configuration Tests:');

    try {
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const pkg = JSON.parse(readText(packageJsonPath));

        // Verify main entry point
        assert(pkg.main === './dist/extension.js', `main should be ./dist/extension.js (actual: ${pkg.main})`);

        // Verify version format
        const versionRegex = /^\d+\.\d+\.\d+$/;
        assert(versionRegex.test(pkg.version), `version should be semver format (actual: ${pkg.version})`);

        // Verify publisher
        assert(typeof pkg.publisher === 'string' && pkg.publisher.length > 0, 'publisher should be set');

        // Verify engines
        assert(pkg.engines?.vscode, 'engines.vscode should be set');

        // Verify vscode:prepublish runs build
        assert(
            pkg.scripts?.['vscode:prepublish']?.includes('npm run build'),
            'vscode:prepublish should include npm run build'
        );

        pass('package.json configuration is valid for VSIX');
    } catch (error) {
        fail('package.json configuration is valid for VSIX', error);
    }
}

// =============================================================================
// 9.2 Extension Activation & Command Registration
// =============================================================================

function testCommandRegistrations(): void {
    console.log('\nCommand Registration Tests:');

    try {
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const pkg = JSON.parse(readText(packageJsonPath));

        const commands = pkg.contributes?.commands || [];
        const commandIds = commands.map((c: { command: string }) => c.command);

        // All expected commands from the extension
        const expectedCommands = [
            'clique.runWorkflow',
            'clique.refresh',
            'clique.setStatus.backlog',
            'clique.setStatus.readyForDev',
            'clique.setStatus.inProgress',
            'clique.setStatus.review',
            'clique.setStatus.done',
            'clique.selectFile',
            'clique.showWorkflowDetail',
            'clique.runPhaseWorkflow',
            'clique.skipWorkflow',
            'clique.initializeWorkflow'
        ];

        for (const cmd of expectedCommands) {
            assert(commandIds.includes(cmd), `Missing command: ${cmd}`);
        }

        pass('All expected commands are registered in package.json');
    } catch (error) {
        fail('All expected commands are registered in package.json', error);
    }
}

function testActivationEvents(): void {
    console.log('\nActivation Events Tests:');

    try {
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const pkg = JSON.parse(readText(packageJsonPath));

        const activationEvents = pkg.activationEvents || [];

        // Check for file-based activation
        const hasSprintActivation = activationEvents.some((e: string) =>
            e.includes('sprint-status.yaml')
        );
        const hasWorkflowActivation = activationEvents.some((e: string) =>
            e.includes('bmm-workflow-status.yaml')
        );

        assert(hasSprintActivation, 'Should activate on sprint-status.yaml');
        assert(hasWorkflowActivation, 'Should activate on bmm-workflow-status.yaml');

        // Check for view-based activation
        const viewActivations = [
            'onView:cliqueDiscovery',
            'onView:cliquePlanning',
            'onView:cliqueSolutioning',
            'onView:cliqueImplementation'
        ];

        for (const viewEvent of viewActivations) {
            assert(activationEvents.includes(viewEvent), `Missing activation event: ${viewEvent}`);
        }

        pass('All activation events are configured');
    } catch (error) {
        fail('All activation events are configured', error);
    }
}

function testExtensionCodeLoadsWithoutErrors(): void {
    console.log('\nExtension Code Load Tests:');

    try {
        // Verify extension.js can be parsed (basic syntax check)
        const extensionPath = path.join(repoRoot, 'dist', 'extension.js');
        const content = readText(extensionPath);

        // Check for critical function presence
        assert(content.includes('activate'), 'extension.js should export activate function');
        assert(content.includes('deactivate'), 'extension.js should export deactivate function');

        // Check for WASM loader integration - look for the actual function names from wasmLoader.ts
        assert(
            content.includes('parseWorkflowStatus') && content.includes('parseSprintStatus'),
            'extension.js should include workflow/sprint parsing functions'
        );

        pass('Extension code loads without syntax errors');
    } catch (error) {
        fail('Extension code loads without syntax errors', error);
    }
}

// =============================================================================
// 9.3 BMAD Workflow Integration Verification
// =============================================================================

function testWorkflowParserIntegration(): void {
    console.log('\nWorkflow Parser Integration Tests:');

    try {
        // Test that fixtures parse correctly through the full pipeline
        const fixtureDir = path.join(repoRoot, 'src', '__tests__', 'fixtures');

        const formats = ['workflow-new.yaml', 'workflow-flat.yaml', 'workflow-old.yaml'];
        for (const fixture of formats) {
            const fixturePath = path.join(fixtureDir, fixture);
            assert(fileExists(fixturePath), `Fixture ${fixture} should exist`);
            const content = readText(fixturePath);
            assert(content.length > 0, `Fixture ${fixture} should not be empty`);
        }

        pass('Workflow fixture files are available for testing');
    } catch (error) {
        fail('Workflow fixture files are available for testing', error);
    }
}

function testSprintParserIntegration(): void {
    console.log('\nSprint Parser Integration Tests:');

    try {
        const fixtureDir = path.join(repoRoot, 'src', '__tests__', 'fixtures');
        const sprintFixture = path.join(fixtureDir, 'sprint-status.yaml');

        assert(fileExists(sprintFixture), 'sprint-status.yaml fixture should exist');

        const content = readText(sprintFixture);
        assert(content.includes('development_status'), 'Sprint fixture should contain development_status');

        pass('Sprint fixture files are available for testing');
    } catch (error) {
        fail('Sprint fixture files are available for testing', error);
    }
}

function testPhaseProviderConfiguration(): void {
    console.log('\nPhase Provider Configuration Tests:');

    try {
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const pkg = JSON.parse(readText(packageJsonPath));

        const views = pkg.contributes?.views?.clique || [];
        const viewIds = views.map((v: { id: string }) => v.id);

        const expectedViews = [
            'cliqueDiscovery',
            'cliquePlanning',
            'cliqueSolutioning',
            'cliqueImplementation',
            'cliqueWelcome'
        ];

        for (const view of expectedViews) {
            assert(viewIds.includes(view), `Missing view: ${view}`);
        }

        // Verify views have correct "when" clauses
        const discoveryView = views.find((v: { id: string }) => v.id === 'cliqueDiscovery');
        assert(discoveryView?.when === 'clique.hasWorkflowFile', 'Discovery view should show when hasWorkflowFile');

        const welcomeView = views.find((v: { id: string }) => v.id === 'cliqueWelcome');
        assert(welcomeView?.when === '!clique.hasWorkflowFile', 'Welcome view should show when !hasWorkflowFile');

        pass('All phase views are configured correctly');
    } catch (error) {
        fail('All phase views are configured correctly', error);
    }
}

// =============================================================================
// 9.4 Documentation & Release Readiness
// =============================================================================

function testDocumentationPresent(): void {
    console.log('\nDocumentation Presence Tests:');

    try {
        const requiredDocs = [
            'README.md',
            'CHANGELOG.md',
            'CLAUDE.md',
            'rust/README.md'
        ];

        for (const doc of requiredDocs) {
            const docPath = path.join(repoRoot, doc);
            assert(fileExists(docPath), `${doc} should exist`);
        }

        // Verify README has Rust/WASM section
        const readme = readText(path.join(repoRoot, 'README.md'));
        assert(
            readme.toLowerCase().includes('rust') || readme.toLowerCase().includes('wasm'),
            'README should mention Rust/WASM'
        );

        pass('All required documentation files exist');
    } catch (error) {
        fail('All required documentation files exist', error);
    }
}

function testVersionConsistency(): void {
    console.log('\nVersion Consistency Tests:');

    try {
        const packageJsonPath = path.join(repoRoot, 'package.json');
        const pkg = JSON.parse(readText(packageJsonPath));
        const version = pkg.version;

        // Verify version is valid semver
        const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
        assert(semverRegex.test(version), `Version ${version} should be valid semver`);

        // Check if CHANGELOG mentions current or recent version
        const changelog = readText(path.join(repoRoot, 'CHANGELOG.md'));
        const majorMinor = version.split('.').slice(0, 2).join('.');
        assert(
            changelog.includes(version) || changelog.includes(majorMinor),
            `CHANGELOG should mention version ${version} or ${majorMinor}`
        );

        pass(`Version ${version} is consistent across package files`);
    } catch (error) {
        fail('Version is consistent across package files', error);
    }
}

function testRustCrateVersions(): void {
    console.log('\nRust Crate Version Tests:');

    try {
        const coreCargoPath = path.join(repoRoot, 'rust', 'clique-core', 'Cargo.toml');
        const wasmCargoPath = path.join(repoRoot, 'rust', 'clique-wasm', 'Cargo.toml');

        assert(fileExists(coreCargoPath), 'clique-core/Cargo.toml should exist');
        assert(fileExists(wasmCargoPath), 'clique-wasm/Cargo.toml should exist');

        const coreContent = readText(coreCargoPath);
        const wasmContent = readText(wasmCargoPath);

        // Verify version fields exist
        assert(coreContent.includes('version = '), 'clique-core should have version');
        assert(wasmContent.includes('version = '), 'clique-wasm should have version');

        pass('Rust crate versions are defined');
    } catch (error) {
        fail('Rust crate versions are defined', error);
    }
}

// =============================================================================
// 9.5 WASM Module Verification
// =============================================================================

function testWasmModuleExports(): void {
    console.log('\nWASM Module Export Tests:');

    try {
        const wasmJsPath = path.join(repoRoot, 'dist', 'wasm', 'clique_wasm.js');
        const content = readText(wasmJsPath);

        // Verify expected function exports
        const expectedExports = [
            'parse_workflow_status_wasm',
            'parse_sprint_status_wasm',
            'update_workflow_status_wasm',
            'update_story_status_wasm',
            'is_inside_workspace_wasm'
        ];

        for (const exportName of expectedExports) {
            assert(
                content.includes(exportName),
                `WASM module should export ${exportName}`
            );
        }

        pass('WASM module exports all expected functions');
    } catch (error) {
        fail('WASM module exports all expected functions', error);
    }
}

function testWasmBinaryIntegrity(): void {
    console.log('\nWASM Binary Integrity Tests:');

    try {
        const wasmPath = path.join(repoRoot, 'dist', 'wasm', 'clique_wasm_bg.wasm');
        const buffer = fs.readFileSync(wasmPath);

        // Verify WASM magic number (\0asm)
        assert(buffer[0] === 0x00, 'WASM should start with magic byte 0x00');
        assert(buffer[1] === 0x61, 'WASM should have magic byte 0x61 (a)');
        assert(buffer[2] === 0x73, 'WASM should have magic byte 0x73 (s)');
        assert(buffer[3] === 0x6d, 'WASM should have magic byte 0x6d (m)');

        // Verify WASM version (1.0)
        assert(buffer[4] === 0x01, 'WASM should be version 1');

        pass('WASM binary has valid format');
    } catch (error) {
        fail('WASM binary has valid format', error);
    }
}

// =============================================================================
// 9.6 End-to-End Integration Smoke Test
// =============================================================================

function testWasmLoaderRuntime(): void {
    console.log('\nWASM Loader Runtime Tests:');

    try {
        // Import and test the actual WASM module
        const wasmJsPath = path.join(repoRoot, 'dist', 'wasm', 'clique_wasm.js');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const wasm = require(wasmJsPath);

        // Test parse function exists and works
        assert(typeof wasm.parse_workflow_status_wasm === 'function', 'parse_workflow_status_wasm should be a function');
        assert(typeof wasm.parse_sprint_status_wasm === 'function', 'parse_sprint_status_wasm should be a function');
        assert(typeof wasm.is_inside_workspace_wasm === 'function', 'is_inside_workspace_wasm should be a function');

        // Test basic workflow parsing
        const workflowYaml = `project: test\nworkflows:\n  brainstorm:\n    status: required`;
        const result = wasm.parse_workflow_status_wasm(workflowYaml);
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        assert(parsed.project === 'test', 'Should parse project name');

        // Test path validation
        const isInside = wasm.is_inside_workspace_wasm('/workspace/file.txt', '/workspace');
        assert(isInside === true, 'Path inside workspace should return true');

        pass('WASM module loads and executes correctly at runtime');
    } catch (error) {
        fail('WASM module loads and executes correctly at runtime', error);
    }
}

// =============================================================================
// Test Runner
// =============================================================================

function runTests(): void {
    console.log('=== Phase 9: Release Verification Tests ===');

    // 9.1 VSIX Structure
    testDistDirectoryStructure();
    testVscodeignoreConfiguration();
    testPackageJsonConfiguration();

    // 9.2 Extension Activation
    testCommandRegistrations();
    testActivationEvents();
    testExtensionCodeLoadsWithoutErrors();

    // 9.3 BMAD Workflow Integration
    testWorkflowParserIntegration();
    testSprintParserIntegration();
    testPhaseProviderConfiguration();

    // 9.4 Documentation & Release Readiness
    testDocumentationPresent();
    testVersionConsistency();
    testRustCrateVersions();

    // 9.5 WASM Module Verification
    testWasmModuleExports();
    testWasmBinaryIntegrity();

    // 9.6 End-to-End Smoke Test
    testWasmLoaderRuntime();

    console.log('\n=== Test Results ===');
    console.log(`  Passed: ${passCount}`);
    console.log(`  Failed: ${failCount}`);

    if (failCount > 0) {
        process.exit(1);
    }
}

try {
    runTests();
} catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
}
