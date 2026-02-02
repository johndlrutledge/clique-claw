// src/phases/implementation/treeProvider.ts
import * as vscode from 'vscode';
import { BaseWorkflowProvider, WorkflowTreeItem } from '../baseWorkflowProvider';
import { SprintData, Epic, Story, StoryStatus } from '../../core/types';

// Re-use story item from existing code with modifications
class StoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly itemType: 'epic' | 'story' | 'divider',
        public readonly data: Epic | Story | null,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(
            StoryTreeItem.getLabel(itemType, data),
            collapsibleState
        );
        if (itemType !== 'divider') {
            this.setupItem();
        }
    }

    private static getLabel(itemType: string, data: Epic | Story | null): string {
        if (itemType === 'divider') {
            return '── Sprint Stories ──';
        }
        if (itemType === 'epic') {
            return data ? (data as Epic).name : 'Epic';
        }
        return data ? (data as Story).id : 'Story';
    }

    private setupItem(): void {
        if (!this.data) return;

        const status = this.data.status;
        this.description = `[${status}]`;
        this.iconPath = this.getIcon(status);

        if (this.itemType === 'story') {
            // Stories with actions get 'story-actionable' so play button shows
            const actionableStatuses = ['backlog', 'ready-for-dev', 'review'];
            this.contextValue = actionableStatuses.includes(status)
                ? 'story-actionable'
                : 'story';
        } else {
            this.contextValue = 'epic';
        }
    }

    private getIcon(status: StoryStatus): vscode.ThemeIcon {
        switch (status) {
            case 'done':
            case 'completed':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'in-progress':
                return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
            case 'review':
                return new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.orange'));
            case 'ready-for-dev':
                return new vscode.ThemeIcon('rocket', new vscode.ThemeColor('charts.yellow'));
            case 'backlog':
                return new vscode.ThemeIcon('circle-outline');
            case 'drafted':
                return new vscode.ThemeIcon('edit');
            default:
                return new vscode.ThemeIcon('question');
        }
    }
}

type ImplementationItem = WorkflowTreeItem | StoryTreeItem;

export class ImplementationTreeProvider extends BaseWorkflowProvider {
    private sprintData: SprintData | null = null;

    constructor() {
        super(3); // Phase 3
    }

    setSprintData(data: SprintData | null): void {
        this.sprintData = data;
        this.refresh();
    }

    override getTreeItem(element: ImplementationItem): vscode.TreeItem {
        return element;
    }

    override getChildren(element?: ImplementationItem): Thenable<ImplementationItem[]> {
        if (!element) {
            return this.getRootChildren();
        }

        if (element instanceof StoryTreeItem && element.itemType === 'epic') {
            const epic = element.data as Epic;
            return Promise.resolve(
                epic.stories.map(story =>
                    new StoryTreeItem('story', story, vscode.TreeItemCollapsibleState.None)
                )
            );
        }

        return Promise.resolve([]);
    }

    private async getRootChildren(): Promise<ImplementationItem[]> {
        const items: ImplementationItem[] = [];

        // Add workflow items for phase 3
        if (this.workflowData) {
            const workflowItems = await super.getChildren();
            items.push(...workflowItems);
        }

        // Add divider if we have both workflow and sprint data
        if (this.workflowData && this.sprintData && this.sprintData.epics.length > 0) {
            items.push(new StoryTreeItem('divider', null, vscode.TreeItemCollapsibleState.None));
        }

        // Add sprint epics
        if (this.sprintData) {
            for (const epic of this.sprintData.epics) {
                items.push(
                    new StoryTreeItem('epic', epic, vscode.TreeItemCollapsibleState.Expanded)
                );
            }
        }

        return items;
    }
}

export { StoryTreeItem };
