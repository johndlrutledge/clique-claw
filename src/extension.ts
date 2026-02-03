// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { performance } from 'perf_hooks';

// Core imports
import { parseWorkflowStatus, findWorkflowStatusFile, updateWorkflowItemStatus, setWorkspaceRoot, getWorkflowParseError } from './core/workflowParser';
import { parseSprintStatus, findAllSprintStatusFiles, updateStoryStatus, setSprintWorkspaceRoot, getSprintParseError } from './core/sprintParser';
import { CliqueFileWatcher } from './core/fileWatcher';
import { WorkflowData, SprintData, StoryStatus, WorkflowItem } from './core/types';

// Phase providers
import { DiscoveryTreeProvider } from './phases/discovery/treeProvider';
import { PlanningTreeProvider } from './phases/planning/treeProvider';
import { SolutioningTreeProvider } from './phases/solutioning/treeProvider';
import { ImplementationTreeProvider, StoryTreeItem } from './phases/implementation/treeProvider';
import { WorkflowTreeItem } from './phases/baseWorkflowProvider';

// UI
import { WorkflowDetailPanel } from './ui/detailPanel';
import { WelcomeViewProvider } from './ui/welcomeView';

// Security: Known workflow commands (matches WORKFLOW_PHASE_MAP keys)
const ALLOWED_WORKFLOW_IDS = new Set([
    'brainstorm', 'brainstorm-project', 'research', 'product-brief',
    'prd', 'validate-prd', 'ux-design', 'create-ux-design',
    'architecture', 'create-architecture', 'epics-stories',
    'create-epics-and-stories', 'test-design', 'implementation-readiness',
    'sprint-planning', 'workflow-init'
]);

// Validate workflow command: only block control characters (newlines)
function isValidWorkflowCommand(command: string | undefined): boolean {
    if (!command) return false;
    if (ALLOWED_WORKFLOW_IDS.has(command)) return true;
    return !/[\r\n\u0000-\u001F\u007F]/.test(command);
}

// Validate story ID format: only block control characters (newlines)
function isValidStoryId(storyId: string): boolean {
    if (!storyId) return false;
    return !/[\r\n\u0000-\u001F\u007F]/.test(storyId);
}

// Build OpenCode command with provider/model from settings
function buildOpenCodeCommand(prompt: string): string {
    const config = vscode.workspace.getConfiguration('clique');
    const provider = config.get<string>('provider', 'opencode');
    const model = config.get<string>('model', '');
    
    // Build model flag if provider/model is specified
    // Format: --model provider/model-name
    let modelFlag = '';
    if (model) {
        // User specified a model, combine with provider
        modelFlag = ` --model ${provider}/${model}`;
    }
    // If no model specified, let OpenCode use its configured default
    // (users can configure defaults in opencode.json or via /connect)
    
    const trimmedPrompt = prompt.trim();
    const isSlashCommand = trimmedPrompt.startsWith('/');
    if (isSlashCommand) {
        const firstSpace = trimmedPrompt.indexOf(' ');
        const slashCommand = firstSpace === -1 ? trimmedPrompt : trimmedPrompt.slice(0, firstSpace);
        const args = firstSpace === -1 ? '' : trimmedPrompt.slice(firstSpace + 1).trim();
        const argsPart = args ? ` "${args}"` : '';
        return `opencode run${modelFlag} --command "${slashCommand}"${argsPart}`;
    }

    return `opencode run${modelFlag} "${prompt}"`;
}

// State
let workspaceRoot: string | null = null;
let workflowStatusPath: string | null = null;
let sprintStatusPath: string | null = null;
let fileWatcher: CliqueFileWatcher | null = null;
let lastWorkflowErrorMessage: string | null = null;
let lastSprintErrorMessage: string | null = null;

// Providers
let discoveryProvider: DiscoveryTreeProvider;
let planningProvider: PlanningTreeProvider;
let solutioningProvider: SolutioningTreeProvider;
let implementationProvider: ImplementationTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    const activationStart = performance.now();
    console.log('Clique extension activated');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        workspaceRoot = workspaceFolders[0].uri.fsPath;
        // Set workspace root for path validation in parsers
        setWorkspaceRoot(workspaceRoot);
        setSprintWorkspaceRoot(workspaceRoot);
    }

    // Initialize providers
    discoveryProvider = new DiscoveryTreeProvider();
    planningProvider = new PlanningTreeProvider();
    solutioningProvider = new SolutioningTreeProvider();
    implementationProvider = new ImplementationTreeProvider();

    // Register tree views
    const discoveryView = vscode.window.createTreeView('cliqueDiscovery', {
        treeDataProvider: discoveryProvider,
        showCollapseAll: false
    });

    const planningView = vscode.window.createTreeView('cliquePlanning', {
        treeDataProvider: planningProvider,
        showCollapseAll: false
    });

    const solutioningView = vscode.window.createTreeView('cliqueSolutioning', {
        treeDataProvider: solutioningProvider,
        showCollapseAll: false
    });

    const implementationView = vscode.window.createTreeView('cliqueImplementation', {
        treeDataProvider: implementationProvider,
        showCollapseAll: true
    });

    // Register welcome view
    const welcomeProvider = new WelcomeViewProvider(
        context.extensionUri,
        () => runWorkflowInit()
    );
    const welcomeView = vscode.window.registerWebviewViewProvider(
        WelcomeViewProvider.viewType,
        welcomeProvider
    );

    // Set up file watcher
    fileWatcher = new CliqueFileWatcher({
        onWorkflowChange: loadWorkflowData,
        onSprintChange: loadSprintData
    });
    fileWatcher.setup();

    // Initialize data
    initializeFiles(context);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('clique.refresh', () => {
            loadWorkflowData();
            loadSprintData();
            vscode.window.showInformationMessage('Clique: Refreshed');
        }),

        vscode.commands.registerCommand('clique.selectFile', () => selectSprintFile(context)),

        vscode.commands.registerCommand('clique.showWorkflowDetail', (item: WorkflowTreeItem) => {
            if (item.workflowItem) {
                showWorkflowDetail(context.extensionUri, item.workflowItem);
            }
        }),

        vscode.commands.registerCommand('clique.runPhaseWorkflow', (item: WorkflowTreeItem) => {
            if (item.workflowItem) {
                runPhaseWorkflow(item.workflowItem);
            }
        }),

        vscode.commands.registerCommand('clique.skipWorkflow', (item: WorkflowTreeItem) => {
            if (item.workflowItem && workflowStatusPath) {
                skipWorkflow(item.workflowItem);
            }
        }),

        vscode.commands.registerCommand('clique.initializeWorkflow', () => runWorkflowInit()),

        vscode.commands.registerCommand('clique.connectProvider', () => connectProvider()),

        vscode.commands.registerCommand('clique.installOpenCode', () => installOpenCode()),

        // Legacy story commands
        vscode.commands.registerCommand('clique.runWorkflow', (item: StoryTreeItem) => {
            if (item.itemType === 'story' && item.data) {
                const story = item.data as { id: string; status: StoryStatus };
                runStoryWorkflow(story.id, story.status);
            }
        }),

        ...registerStatusCommands(context)
    ];

    context.subscriptions.push(
        discoveryView, planningView, solutioningView, implementationView,
        welcomeView, ...commands
    );

    if (fileWatcher) {
        context.subscriptions.push(fileWatcher);
    }

    // Check if OpenCode CLI is installed (async, non-blocking)
    checkOpenCodeInstalled();

    const activationTimeMs = performance.now() - activationStart;
    console.log(`Clique activation completed in ${activationTimeMs.toFixed(2)}ms`);
}

function initializeFiles(context: vscode.ExtensionContext): void {
    if (!workspaceRoot) {
        updateHasWorkflowContext(false);
        return;
    }

    // Find workflow status file
    workflowStatusPath = findWorkflowStatusFile(workspaceRoot);

    if (workflowStatusPath) {
        updateHasWorkflowContext(true);
        loadWorkflowData();
        fileWatcher?.watchFile(workflowStatusPath, 'workflow');
    } else {
        updateHasWorkflowContext(false);
    }

    // Find sprint status file
    const savedSprintPath = context.workspaceState.get<string>('clique.selectedFile');
    if (savedSprintPath) {
        sprintStatusPath = savedSprintPath;
        loadSprintData();
    } else {
        const sprintFiles = findAllSprintStatusFiles(workspaceRoot);
        if (sprintFiles.length === 1) {
            sprintStatusPath = sprintFiles[0];
            context.workspaceState.update('clique.selectedFile', sprintStatusPath);
            loadSprintData();
        }
    }

    if (sprintStatusPath) {
        fileWatcher?.watchFile(sprintStatusPath, 'sprint');
    }
}

function updateHasWorkflowContext(hasFile: boolean): void {
    vscode.commands.executeCommand('setContext', 'clique.hasWorkflowFile', hasFile);
}

function loadWorkflowData(): void {
    if (!workflowStatusPath) {
        const data = null;
        discoveryProvider.setData(data);
        planningProvider.setData(data);
        solutioningProvider.setData(data);
        implementationProvider.setData(data);
        return;
    }

    const data = parseWorkflowStatus(workflowStatusPath);
    discoveryProvider.setData(data);
    planningProvider.setData(data);
    solutioningProvider.setData(data);
    implementationProvider.setData(data);

    const workflowError = getWorkflowParseError();
    if (!data && workflowError && workflowError !== lastWorkflowErrorMessage) {
        lastWorkflowErrorMessage = workflowError;
        vscode.window.showErrorMessage(`Clique: Failed to parse workflow status: ${workflowError}`);
    } else if (data) {
        lastWorkflowErrorMessage = null;
    }

    if (data) {
        console.log(`Clique: Loaded ${data.items.length} workflow items`);
    }
}

function loadSprintData(): void {
    if (!sprintStatusPath) {
        implementationProvider.setSprintData(null);
        return;
    }

    const data = parseSprintStatus(sprintStatusPath);
    implementationProvider.setSprintData(data);

    const sprintError = getSprintParseError();
    if (!data && sprintError && sprintError !== lastSprintErrorMessage) {
        lastSprintErrorMessage = sprintError;
        vscode.window.showErrorMessage(`Clique: Failed to parse sprint status: ${sprintError}`);
    } else if (data) {
        lastSprintErrorMessage = null;
    }

    if (data) {
        const totalStories = data.epics.reduce((sum, e) => sum + e.stories.length, 0);
        console.log(`Clique: Loaded ${totalStories} stories`);
    }
}

async function selectSprintFile(context: vscode.ExtensionContext): Promise<void> {
    if (!workspaceRoot) return;

    const files = findAllSprintStatusFiles(workspaceRoot);
    if (files.length === 0) {
        vscode.window.showWarningMessage('Clique: No sprint-status.yaml files found');
        return;
    }

    const items = files.map(file => ({
        label: path.relative(workspaceRoot!, file),
        description: file === sprintStatusPath ? '(current)' : '',
        fullPath: file
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select sprint-status.yaml file'
    });

    if (selected) {
        sprintStatusPath = selected.fullPath;
        context.workspaceState.update('clique.selectedFile', sprintStatusPath);
        loadSprintData();
        fileWatcher?.watchFile(sprintStatusPath, 'sprint');
        vscode.window.showInformationMessage(`Clique: Using ${selected.label}`);
    }
}

function showWorkflowDetail(extensionUri: vscode.Uri, item: WorkflowItem): void {
    WorkflowDetailPanel.show(
        extensionUri,
        item,
        () => runPhaseWorkflow(item),
        () => skipWorkflow(item)
    );
}

function runPhaseWorkflow(item: WorkflowItem): void {
    if (!isValidWorkflowCommand(item.command)) {
        vscode.window.showErrorMessage(`Invalid workflow command: ${item.id}`);
        return;
    }
    const command = buildOpenCodeCommand(`/bmad:bmm:workflows:${item.command}`);
    const terminalName = `Clique: ${item.id}`;
    const terminal = vscode.window.createTerminal(terminalName);
    terminal.sendText(command);
    terminal.show();

    vscode.window.showInformationMessage(
        `Running ${item.id}`,
        'Show Terminal'
    ).then(action => {
        if (action === 'Show Terminal') {
            terminal.show();
        }
    });
}

function skipWorkflow(item: WorkflowItem): void {
    if (!workflowStatusPath) return;

    const success = updateWorkflowItemStatus(workflowStatusPath, item.id, 'skipped');
    if (success) {
        loadWorkflowData();
        vscode.window.showInformationMessage(`Skipped: ${item.id}`);
    } else {
        vscode.window.showErrorMessage(`Failed to skip: ${item.id}`);
    }
}

function runWorkflowInit(): void {
    const command = buildOpenCodeCommand('/bmad:bmm:workflows:workflow-init');
    const terminal = vscode.window.createTerminal('Clique: Initialize');
    terminal.sendText(command);
    terminal.show();
}

function connectProvider(): void {
    const terminal = vscode.window.createTerminal('Clique: Connect Provider');
    terminal.sendText('opencode auth login');
    terminal.show();
    vscode.window.showInformationMessage(
        'Follow the prompts in the terminal to connect your AI provider.',
        'Show Terminal'
    ).then(action => {
        if (action === 'Show Terminal') {
            terminal.show();
        }
    });
}

async function installOpenCode(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
        'Install OpenCode CLI? This will run the official installer.',
        'Install via npm',
        'Install via curl',
        'Cancel'
    );
    
    if (choice === 'Cancel' || !choice) {
        return;
    }
    
    const terminal = vscode.window.createTerminal('Clique: Install OpenCode');
    
    if (choice === 'Install via npm') {
        terminal.sendText('npm install -g opencode-ai@latest');
    } else if (choice === 'Install via curl') {
        // Cross-platform: curl works on Windows with Git Bash, macOS, Linux
        terminal.sendText('curl -fsSL https://opencode.ai/install | bash');
    }
    
    terminal.show();
    vscode.window.showInformationMessage(
        'Installing OpenCode CLI. After installation, run "Connect Provider" to configure your API keys.'
    );
}

async function checkOpenCodeInstalled(): Promise<void> {
    const { exec } = require('child_process');
    
    exec('opencode --version', (error: Error | null) => {
        if (error) {
            // OpenCode not found - prompt to install
            vscode.window.showWarningMessage(
                'OpenCode CLI is not installed. CliqueClaw requires OpenCode to run workflows.',
                'Install OpenCode',
                'Dismiss'
            ).then(choice => {
                if (choice === 'Install OpenCode') {
                    vscode.commands.executeCommand('clique.installOpenCode');
                }
            });
        }
    });
}

function runStoryWorkflow(storyId: string, status: StoryStatus): void {
    if (!isValidStoryId(storyId)) {
        vscode.window.showErrorMessage(`Invalid story ID format: ${storyId}`);
        return;
    }
    const actions: Partial<Record<StoryStatus, { label: string; command: string }>> = {
        'backlog': { label: 'Create Story', command: 'create-story' },
        'ready-for-dev': { label: 'Start Dev', command: 'dev-story' },
        'review': { label: 'Code Review', command: 'code-review' }
    };

    const action = actions[status];
    if (!action) {
        vscode.window.showWarningMessage(`No workflow action for status: ${status}`);
        return;
    }

    const command = buildOpenCodeCommand(`/bmad:bmm:workflows:${action.command} ${storyId}`);
    const terminal = vscode.window.createTerminal(`Clique: ${storyId}`);
    terminal.sendText(command);
    terminal.show();

    vscode.window.showInformationMessage(`Running ${action.label} for ${storyId}`);
}

function registerStatusCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const handler = (newStatus: StoryStatus) => (item: StoryTreeItem) => {
        if (item.itemType === 'story' && item.data && sprintStatusPath) {
            const story = item.data as { id: string };
            const success = updateStoryStatus(sprintStatusPath, story.id, newStatus);
            if (success) {
                loadSprintData();
                vscode.window.showInformationMessage(`Set ${story.id} to ${newStatus}`);
            } else {
                vscode.window.showErrorMessage(`Failed to update status for ${story.id}`);
            }
        }
    };

    return [
        vscode.commands.registerCommand('clique.setStatus.backlog', handler('backlog')),
        vscode.commands.registerCommand('clique.setStatus.readyForDev', handler('ready-for-dev')),
        vscode.commands.registerCommand('clique.setStatus.inProgress', handler('in-progress')),
        vscode.commands.registerCommand('clique.setStatus.review', handler('review')),
        vscode.commands.registerCommand('clique.setStatus.done', handler('done'))
    ];
}

export function deactivate() {
    if (fileWatcher) {
        fileWatcher.dispose();
    }
}
