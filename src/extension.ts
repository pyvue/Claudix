/**
 * VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import { registerServices, ILogService, IClaudeAgentService, IWebViewService } from './services/serviceRegistry';
import { VSCodeTransport } from './services/claude/transport/VSCodeTransport';
import type { RequestMessage, SelectionChangedRequest, SelectionRange } from './shared/messages';
import { selectionState } from './services/selectionState';

/**
 * Extension Activation
 */
export function activate(context: vscode.ExtensionContext) {
	// 1. Create service builder
	const builder = new InstantiationServiceBuilder();

	// 2. Register all services
	registerServices(builder, context);

	// 3. Seal the builder and create DI container
	const instantiationService = builder.seal();

	// 4. Log activation
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('');
		logService.info('╔════════════════════════════════════════╗');
		logService.info('║         Claude Chat 扩展已激活           ║');
		logService.info('╚════════════════════════════════════════╝');
		logService.info('');
	});

	// 5. Connect services
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		const webViewService = accessor.get(IWebViewService);
		const claudeAgentService = accessor.get(IClaudeAgentService);
		const subscriptions = context.subscriptions;

		// Register WebView View Provider
		const webviewProvider = vscode.window.registerWebviewViewProvider(
			'claudix.chatView',
			webViewService,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);

		// Connect WebView messages to Claude Agent Service
		webViewService.setMessageHandler((message) => {
			claudeAgentService.fromClient(message);
		});

		// Create VSCode Transport
		const transport = instantiationService.createInstance(VSCodeTransport);

		// Set transport on Claude Agent Service
		claudeAgentService.setTransport(transport);

		// Start message loop
		claudeAgentService.start();

		// Register disposables
		context.subscriptions.push(webviewProvider);
		context.subscriptions.push(
			vscode.commands.registerCommand('claudix.openSettings', async () => {
				await instantiationService.invokeFunction(accessorInner => {
					const webViewServiceInner = accessorInner.get(IWebViewService);
					const logServiceInner = accessorInner.get(ILogService);
					try {
						// Settings 页为单实例，不传 instanceId，使用 page 作为 key
						webViewServiceInner.openEditorPage('settings', 'Claudix Settings');
					} catch (error) {
						logServiceInner.error('[Command] 打开 Settings 页面失败', error);
					}
				});
			})
		);

		logService.info('✓ Claude Agent Service 已连接 Transport');
		logService.info('✓ WebView Service 已注册为 View Provider');
		logService.info('✓ Settings 命令已注册');

		const buildSelectionRange = (editor?: vscode.TextEditor): SelectionRange | null => {
			if (!editor) {
				return null;
			}

			const { document, selection } = editor;
			if (!document || document.uri.scheme !== 'file' || !selection || selection.isEmpty) {
				return null;
			}

			return {
				filePath: document.uri.fsPath,
				startLine: selection.start.line + 1,
				endLine: selection.end.line + 1,
				startColumn: selection.start.character,
				endColumn: selection.end.character,
				selectedText: document.getText(selection)
			};
		};

		let lastSelectionSignature: string | null = null;

		const serializeSelection = (selection: SelectionRange | null): string => {
			if (!selection) {
				return '::no_selection::';
			}
			const {
				filePath,
				startLine,
				endLine,
				startColumn,
				endColumn,
				selectedText
			} = selection;
			return JSON.stringify({
				filePath,
				startLine,
				endLine,
				startColumn,
				endColumn,
				selectedText
			});
		};

		const sendSelectionUpdate = (selection: SelectionRange | null, options?: { force?: boolean }) => {
			const signature = serializeSelection(selection);
			if (!options?.force && signature === lastSelectionSignature) {
				return;
			}
			lastSelectionSignature = signature;

			const message: RequestMessage<SelectionChangedRequest> = {
				type: 'request',
				requestId: `selection-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				request: {
					type: 'selection_changed',
					selection
				}
			};

			try {
				webViewService.postMessage(message);
			} catch (error) {
				logService.warn('[SelectionSync] 发送选区信息失败', error as Error);
			}
		};

		const syncSelection = (editor?: vscode.TextEditor, options?: { autoInclude?: boolean }) => {
			const selection = buildSelectionRange(editor);
			const isEditorSelectable = !!editor && editor.document.uri.scheme === 'file';

			if (!selection) {
				if (!isEditorSelectable && selectionState.hasPendingAutoInclude()) {
					// 正在等待自动插入选区时，避免因 WebView 抢焦点清空缓存
					return;
				}
				selectionState.set(null);
				sendSelectionUpdate(null);
				return;
			}

			selectionState.set(selection, { autoInclude: options?.autoInclude });

			let payload: SelectionRange | null = selection;
			if (options?.autoInclude) {
				payload = { ...selection, autoInclude: true };
			}
			sendSelectionUpdate(payload, { force: options?.autoInclude });
		};

		// 初始化同步一次选区
		syncSelection(vscode.window.activeTextEditor);

		subscriptions.push(
			vscode.window.onDidChangeTextEditorSelection(event => {
				syncSelection(event.textEditor);
			})
		);

		subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor(editor => {
				syncSelection(editor);
			})
		);

		const includeSelectionCommand = vscode.commands.registerCommand('claudix.addSelectionToChat', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.selection.isEmpty || editor.document.uri.scheme !== 'file') {
				void vscode.window.showWarningMessage('请先在文件中选择需要发送的代码片段');
				return;
			}

			syncSelection(editor, { autoInclude: true });
			await vscode.commands.executeCommand('claudix.chatView.focus');
		});

		subscriptions.push(includeSelectionCommand);
	});

	// 6. Register commands
	const showChatCommand = vscode.commands.registerCommand('claudix.showChat', () => {
		vscode.commands.executeCommand('claudix.chatView.focus');
	});

	context.subscriptions.push(showChatCommand);

	// 7. Log completion
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('✓ Claude Chat 视图已注册');
		logService.info('');
	});

	// Return extension API (if needed to expose to other extensions)
	return {
		getInstantiationService: () => instantiationService
	};
}

/**
 * Extension Deactivation
 */
export function deactivate() {
	// Clean up resources
}
