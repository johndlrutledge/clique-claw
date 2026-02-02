// src/core/fileWatcher.ts
import * as vscode from 'vscode';
import * as fs from 'fs';

export interface FileWatcherOptions {
    onWorkflowChange: () => void;
    onSprintChange: () => void;
}

export class CliqueFileWatcher implements vscode.Disposable {
    private vsCodeWatcher: vscode.FileSystemWatcher | null = null;
    private nativeWatchers: Map<string, fs.FSWatcher> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly debounceMs = 300;

    constructor(private options: FileWatcherOptions) {}

    setup(): void {
        this.vsCodeWatcher = vscode.workspace.createFileSystemWatcher(
            '**/{sprint-status.yaml,bmm-workflow-status.yaml}'
        );

        this.vsCodeWatcher.onDidChange(uri => this.handleChange(uri));
        this.vsCodeWatcher.onDidCreate(uri => this.handleChange(uri));
        this.vsCodeWatcher.onDidDelete(uri => this.handleDelete(uri));
    }

    watchFile(filePath: string, type: 'workflow' | 'sprint'): void {
        this.disposeNativeWatcher(filePath);

        if (!fs.existsSync(filePath)) {
            return;
        }

        try {
            const watcher = fs.watch(filePath, eventType => {
                this.debouncedNotify(filePath, type);

                if (eventType === 'rename') {
                    setTimeout(() => {
                        if (fs.existsSync(filePath)) {
                            this.watchFile(filePath, type);
                        }
                    }, 100);
                }
            });

            watcher.on('error', () => {
                setTimeout(() => {
                    if (fs.existsSync(filePath)) {
                        this.watchFile(filePath, type);
                    }
                }, 1000);
            });

            this.nativeWatchers.set(filePath, watcher);
        } catch (error) {
            console.error('Clique: Failed to set up native watcher:', error);
        }
    }

    private handleChange(uri: vscode.Uri): void {
        const type = uri.fsPath.includes('bmm-workflow-status') ? 'workflow' : 'sprint';
        this.debouncedNotify(uri.fsPath, type);
    }

    private handleDelete(uri: vscode.Uri): void {
        this.disposeNativeWatcher(uri.fsPath);
    }

    private debouncedNotify(filePath: string, type: 'workflow' | 'sprint'): void {
        const existing = this.debounceTimers.get(filePath);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.debounceTimers.delete(filePath);
            if (type === 'workflow') {
                this.options.onWorkflowChange();
            } else {
                this.options.onSprintChange();
            }
        }, this.debounceMs);

        this.debounceTimers.set(filePath, timer);
    }

    private disposeNativeWatcher(filePath: string): void {
        const watcher = this.nativeWatchers.get(filePath);
        if (watcher) {
            watcher.close();
            this.nativeWatchers.delete(filePath);
        }
    }

    dispose(): void {
        this.vsCodeWatcher?.dispose();
        for (const watcher of this.nativeWatchers.values()) {
            watcher.close();
        }
        this.nativeWatchers.clear();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }
}
