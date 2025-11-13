/**
 * WebView 服务 / WebView Service
 *
 * 职责：
 * 1. 实现 vscode.WebviewViewProvider 接口
 * 2. 管理 WebView 实例和生命周期
 * 3. 生成 WebView HTML 内容
 * 4. 提供消息收发接口
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IWebViewService = createDecorator<IWebViewService>('webViewService');

export interface IWebViewService extends vscode.WebviewViewProvider {
	readonly _serviceBrand: undefined;

	/**
	 * 获取当前的 WebView 实例
	 */
	getWebView(): vscode.Webview | undefined;

	/**
	 * 发送消息到 WebView
	 */
	postMessage(message: any): void;

	/**
	 * 设置消息接收处理器
	 */
	setMessageHandler(handler: (message: any) => void): void;
}

/**
 * WebView 服务实现
 */
export class WebViewService implements IWebViewService {
	readonly _serviceBrand: undefined;

	private webview?: vscode.Webview;
	private messageHandler?: (message: any) => void;

	constructor(
		private readonly context: vscode.ExtensionContext,
		@ILogService private readonly logService: ILogService
	) {}

	/**
	 * 实现 WebviewViewProvider.resolveWebviewView
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void | Thenable<void> {
		this.logService.info('开始解析 WebView 视图');

		// 配置 WebView 选项
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
				vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
			]
		};

		// 保存 WebView 实例
		this.webview = webviewView.webview;

		// 连接消息处理器
		webviewView.webview.onDidReceiveMessage(
			message => {
				this.logService.info(`[WebView → Extension] 收到消息: ${message.type}`);
				if (this.messageHandler) {
					this.messageHandler(message);
				}
			},
			undefined,
			this.context.subscriptions
		);

		// 设置 WebView HTML（根据开发/生产模式切换）
		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		this.logService.info('WebView 视图解析完成');
	}

	/**
	 * 获取当前的 WebView 实例
	 */
	getWebView(): vscode.Webview | undefined {
		return this.webview;
	}

	/**
	 * 发送消息到 WebView
	 */
	postMessage(message: any): void {
		if (!this.webview) {
			throw new Error('WebView not initialized');
		}
		this.webview.postMessage({
			type: 'from-extension',
			message: message
		});
	}

	/**
	 * 设置消息接收处理器
	 */
	setMessageHandler(handler: (message: any) => void): void {
		this.messageHandler = handler;
	}

	/**
	 * 生成 WebView HTML
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		const isDev = this.context.extensionMode === vscode.ExtensionMode.Development;
		const nonce = this.getNonce();

		if (isDev) {
			return this.getDevHtml(webview, nonce);
		}

		const extensionUri = vscode.Uri.file(this.context.extensionPath);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'main.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'style.css')
		);

		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data:;`,
			`script-src ${webview.cspSource} 'nonce-${nonce}';`,
			`connect-src ${webview.cspSource} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudex Chat</title>
    <link href="${styleUri}" rel="stylesheet" />
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	private getDevHtml(webview: vscode.Webview, nonce: string): string {
		// 读取 dev server 地址（可通过环境变量覆盖）
		const devServer = process.env.VITE_DEV_SERVER_URL
			|| process.env.WEBVIEW_DEV_SERVER_URL
			|| `http://localhost:${process.env.VITE_DEV_PORT || 5173}`;

		let origin = '';
		let wsUrl = '';
		try {
			const u = new URL(devServer);
			origin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
			const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
			wsUrl = `${wsProtocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
		} catch {
			origin = devServer; // 回退（尽量允许）
			wsUrl = 'ws://localhost:5173';
		}

		// Vite 开发场景的 CSP：允许连接 devServer 与 HMR 的 ws
		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' ${origin} https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data: ${origin};`,
			`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' ${origin};`,
			`connect-src ${webview.cspSource} ${origin} ${wsUrl} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		const client = `${origin}/@vite/client`;
		const entry = `${origin}/src/main.ts`;

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base href="${origin}/" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudex Chat (Dev)</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${client}"></script>
    <script type="module" nonce="${nonce}" src="${entry}"></script>
</body>
</html>`;
	}

	/**
	 * 生成随机 nonce
	 */
	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
