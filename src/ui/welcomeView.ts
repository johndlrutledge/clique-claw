// src/ui/welcomeView.ts
import * as vscode from 'vscode';

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'cliqueWelcome';
    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly onInitialize: () => void
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'initialize') {
                this.onInitialize();
            }
        });
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            text-align: center;
            color: var(--vscode-foreground);
        }
        .icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
        h2 {
            margin: 0 0 12px 0;
            font-weight: 500;
        }
        p {
            color: var(--vscode-descriptionForeground);
            margin: 0 0 20px 0;
            line-height: 1.5;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            font-size: 14px;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .hint {
            margin-top: 16px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="icon">🚀</div>
    <h2>Welcome to Clique</h2>
    <p>Get started with the BMAD Method by initializing your project workflow.</p>
    <button onclick="initialize()">Initialize Workflow</button>
    <p class="hint">This will run workflow-init to set up your project's workflow status file.</p>

    <script>
        const vscode = acquireVsCodeApi();
        function initialize() {
            vscode.postMessage({ command: 'initialize' });
        }
    </script>
</body>
</html>`;
    }
}
