// src/ui/detailPanel.ts
import * as vscode from 'vscode';
import { WorkflowItem } from '../core/types';

// Security: Escape HTML special characters to prevent XSS
function escapeHtml(unsafe: string | undefined): string {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export class WorkflowDetailPanel {
    public static currentPanel: WorkflowDetailPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        extensionUri: vscode.Uri,
        item: WorkflowItem,
        onRun: () => void,
        onSkip: () => void
    ): void {
        const column = vscode.ViewColumn.Beside;

        if (WorkflowDetailPanel.currentPanel) {
            WorkflowDetailPanel.currentPanel.panel.reveal(column);
            WorkflowDetailPanel.currentPanel.update(item, onRun, onSkip);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'cliqueWorkflowDetail',
            'Workflow Details',
            column,
            { enableScripts: true }
        );

        WorkflowDetailPanel.currentPanel = new WorkflowDetailPanel(panel, extensionUri);
        WorkflowDetailPanel.currentPanel.update(item, onRun, onSkip);
    }

    private update(item: WorkflowItem, onRun: () => void, onSkip: () => void): void {
        this.panel.title = this.formatTitle(item.id);
        this.panel.webview.html = this.getHtml(item);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'run':
                        onRun();
                        return;
                    case 'skip':
                        onSkip();
                        return;
                }
            },
            null,
            this.disposables
        );
    }

    private formatTitle(id: string): string {
        return id
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    private getPhaseName(phase: number | 'prerequisite'): string {
        if (phase === 'prerequisite') return 'Prerequisite';
        const names = ['Discovery', 'Planning', 'Solutioning', 'Implementation'];
        return `${names[phase]} (Phase ${phase})`;
    }

    private getHtml(item: WorkflowItem): string {
        const title = escapeHtml(this.formatTitle(item.id));
        const isActionable = item.status === 'required' ||
                            item.status === 'optional' ||
                            item.status === 'recommended' ||
                            item.status === 'conditional';
        const isCompleted = !isActionable && item.status !== 'skipped' && item.status !== 'conditional';
        const escapedAgent = escapeHtml(item.agent);
        const escapedCommand = escapeHtml(item.command);
        const escapedStatus = escapeHtml(item.status);
        const escapedNote = escapeHtml(item.note);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        h1 {
            margin-top: 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .field {
            margin: 12px 0;
        }
        .label {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-bottom: 4px;
        }
        .value {
            font-size: 14px;
        }
        .note {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            padding: 10px;
            margin: 16px 0;
        }
        .actions {
            margin-top: 24px;
            display: flex;
            gap: 10px;
        }
        button {
            padding: 8px 16px;
            border: none;
            cursor: pointer;
            font-size: 14px;
        }
        .primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .completed {
            color: var(--vscode-charts-green);
        }
    </style>
</head>
<body>
    <h1>${title}</h1>

    <div class="field">
        <div class="label">Phase</div>
        <div class="value">${this.getPhaseName(item.phase)}</div>
    </div>

    <div class="field">
        <div class="label">Agent</div>
        <div class="value">${escapedAgent}</div>
    </div>

    <div class="field">
        <div class="label">Command</div>
        <div class="value"><code>/bmad:bmm:workflows:${escapedCommand}</code></div>
    </div>

    <div class="field">
        <div class="label">Status</div>
        <div class="value ${isCompleted ? 'completed' : ''}">${escapedStatus}</div>
    </div>

    ${item.note ? `
    <div class="note">
        <div class="label">Note</div>
        <div class="value">${escapedNote}</div>
    </div>
    ` : ''}

    ${isActionable ? `
    <div class="actions">
        <button class="primary" onclick="run()">Run Workflow</button>
        <button class="secondary" onclick="skip()">Mark Skipped</button>
    </div>
    ` : ''}

    <script>
        const vscode = acquireVsCodeApi();
        function run() {
            vscode.postMessage({ command: 'run' });
        }
        function skip() {
            vscode.postMessage({ command: 'skip' });
        }
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        WorkflowDetailPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
