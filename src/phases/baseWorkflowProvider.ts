// src/phases/baseWorkflowProvider.ts
import * as vscode from 'vscode';
import { WorkflowItem, WorkflowData } from '../core/types';

export class WorkflowTreeItem extends vscode.TreeItem {
    constructor(
        public readonly workflowItem: WorkflowItem,
        public readonly isNextAction: boolean
    ) {
        super(WorkflowTreeItem.formatLabel(workflowItem.id), vscode.TreeItemCollapsibleState.None);
        this.setupItem();
    }

    private static formatLabel(id: string): string {
        return id
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    private setupItem(): void {
        const status = this.workflowItem.status;

        this.description = `[${this.workflowItem.agent}]`;
        this.tooltip = this.buildTooltip();
        this.iconPath = this.getIcon();
        this.contextValue = this.getContextValue();

        // Set click command to show detail panel
        this.command = {
            command: 'clique.showWorkflowDetail',
            title: 'Show Details',
            arguments: [this]
        };
    }

    private buildTooltip(): string {
        const lines = [
            `${WorkflowTreeItem.formatLabel(this.workflowItem.id)}`,
            `Agent: ${this.workflowItem.agent}`,
            `Status: ${this.workflowItem.status}`,
            `Command: /bmad:bmm:workflows:${this.workflowItem.command}`
        ];
        if (this.workflowItem.note) {
            lines.push(`\n${this.workflowItem.note}`);
        }
        return lines.join('\n');
    }

    private getIcon(): vscode.ThemeIcon {
        const status = this.workflowItem.status;

        if (this.isNextAction) {
            return new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.blue'));
        }
        if (status === 'skipped') {
            return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
        }
        if (status === 'conditional') {
            return new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('charts.yellow'));
        }
        if (status === 'required' || status === 'optional' || status === 'recommended') {
            return new vscode.ThemeIcon('circle-outline');
        }
        // Status is a file path = completed
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    }

    private getContextValue(): string {
        if (this.isNextAction) {
            return 'workflow-actionable';
        }
        if (this.workflowItem.status === 'skipped') {
            return 'workflow-skipped';
        }
        if (this.isCompleted()) {
            return 'workflow-completed';
        }
        return 'workflow-pending';
    }

    isCompleted(): boolean {
        const status = this.workflowItem.status;
        return status !== 'required' &&
               status !== 'optional' &&
               status !== 'recommended' &&
               status !== 'conditional' &&
               status !== 'skipped';
    }

    isActionable(): boolean {
        const status = this.workflowItem.status;
        return status === 'required' || status === 'optional' || status === 'recommended';
    }
}

export class BaseWorkflowProvider implements vscode.TreeDataProvider<any> {
    private _onDidChangeTreeData = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    protected workflowData: WorkflowData | null = null;
    protected phaseNumber: number;

    constructor(phaseNumber: number) {
        this.phaseNumber = phaseNumber;
    }

    setData(data: WorkflowData | null): void {
        this.workflowData = data;
        this._onDidChangeTreeData.fire(undefined);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: any): vscode.TreeItem {
        return element;
    }

    getChildren(element?: any): Thenable<any[]> {
        if (element) {
            // Base implementation doesn't support children
            return Promise.resolve([]);
        }

        if (!this.workflowData) {
            return Promise.resolve([]);
        }

        const phaseItems = this.workflowData.items.filter(
            item => item.phase === this.phaseNumber
        );

        // Find first actionable item for "next action" indicator
        let foundNextAction = false;
        const treeItems = phaseItems.map(item => {
            const isNext = !foundNextAction && this.isActionable(item);
            if (isNext) {
                foundNextAction = true;
            }
            return new WorkflowTreeItem(item, isNext);
        });

        return Promise.resolve(treeItems);
    }

    private isActionable(item: WorkflowItem): boolean {
        const status = item.status;
        return status === 'required' || status === 'optional' || status === 'recommended';
    }
}
