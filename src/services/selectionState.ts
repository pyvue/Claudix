import type { SelectionRange } from '../shared/messages';

/**
 * SelectionState 用于在扩展与 Handler 之间共享最新选区
 * 以便 WebView 初始化时仍可获取之前捕获的选区信息。
 */
class SelectionState {
	private lastSelection: SelectionRange | null = null;
	private lastSignature: string | null = null;
	private pendingAutoInclude = false;
	private pendingSignature: string | null = null;

	set(selection: SelectionRange | null, options?: { autoInclude?: boolean }): void {
		if (selection) {
			this.lastSelection = { ...selection };
			this.lastSignature = this.serialize(selection);
		} else {
			this.lastSelection = null;
			this.lastSignature = null;
		}

		if (selection && options?.autoInclude) {
			this.pendingAutoInclude = true;
			this.pendingSignature = this.lastSignature;
			return;
		}

		if (!selection || this.pendingSignature !== this.lastSignature) {
			this.pendingAutoInclude = false;
			this.pendingSignature = null;
		}
	}

	getSnapshot(): SelectionRange | null {
		return this.lastSelection ? { ...this.lastSelection } : null;
	}

	consume(): SelectionRange | null {
		if (!this.lastSelection) {
			return null;
		}

		const snapshot = { ...this.lastSelection };
		if (this.pendingAutoInclude) {
			snapshot.autoInclude = true;
			this.pendingAutoInclude = false;
			this.pendingSignature = null;
		}
		return snapshot;
	}

	hasPendingAutoInclude(): boolean {
		return this.pendingAutoInclude;
	}

	clearAutoInclude(): void {
		this.pendingAutoInclude = false;
		this.pendingSignature = null;
	}

	private serialize(selection: SelectionRange): string {
		const { filePath, startLine, endLine, startColumn, endColumn, selectedText } = selection;
		return `${filePath}:${startLine}:${endLine}:${startColumn ?? 0}:${endColumn ?? 0}:${selectedText}`;
	}
}

export const selectionState = new SelectionState();
