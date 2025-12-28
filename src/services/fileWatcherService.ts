/**
 * File Watcher Service
 *
 * Monitors file system changes and emits events
 * Used to detect when cc-switch updates Claude Code configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IFileWatcherService = createDecorator<IFileWatcherService>('fileWatcherService');

/**
 * File change event
 */
export interface FileChangeEvent {
	filePath: string;
	changeType: 'created' | 'modified' | 'deleted';
	timestamp: Date;
}

/**
 * File Watcher Service Interface
 */
export interface IFileWatcherService {
	readonly _serviceBrand: undefined;

	/**
	 * Watch Claude Code settings file for changes
	 */
	watchClaudeSettings(callback: (event: FileChangeEvent) => void): vscode.Disposable;

	/**
	 * Watch CC-Switch database for changes
	 */
	watchCCSwitchDatabase(callback: (event: FileChangeEvent) => void): vscode.Disposable;

	/**
	 * Get Claude settings file path
	 */
	getClaudeSettingsPath(): string;

	/**
	 * Get CC-Switch database path
	 */
	getCCSwitchDatabasePath(): string;
}

/**
 * File Watcher Service Implementation
 */
export class FileWatcherService implements IFileWatcherService {
	readonly _serviceBrand: undefined;

	private readonly claudeSettingsPath: string;
	private readonly ccSwitchDbPath: string;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		// Claude Code settings: ~/.claude/settings.json
		this.claudeSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

		// Alternative: claude.json (fallback)
		if (!fs.existsSync(this.claudeSettingsPath)) {
			const altPath = path.join(os.homedir(), '.claude', 'claude.json');
			if (fs.existsSync(altPath)) {
				this.claudeSettingsPath = altPath;
			}
		}

		// CC-Switch database: ~/.cc-switch/cc-switch.db
		this.ccSwitchDbPath = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');

		this.logService.info('[FileWatcherService] 已初始化');
		this.logService.info(`[FileWatcherService] Claude 配置路径: ${this.claudeSettingsPath}`);
		this.logService.info(`[FileWatcherService] CC-Switch 数据库路径: ${this.ccSwitchDbPath}`);
	}

	/**
	 * Get Claude settings file path
	 */
	getClaudeSettingsPath(): string {
		return this.claudeSettingsPath;
	}

	/**
	 * Get CC-Switch database path
	 */
	getCCSwitchDatabasePath(): string {
		return this.ccSwitchDbPath;
	}

	/**
	 * Watch Claude Code settings file for changes
	 */
	watchClaudeSettings(callback: (event: FileChangeEvent) => void): vscode.Disposable {
		return this.watchFile(this.claudeSettingsPath, 'Claude Settings', callback);
	}

	/**
	 * Watch CC-Switch database for changes
	 */
	watchCCSwitchDatabase(callback: (event: FileChangeEvent) => void): vscode.Disposable {
		return this.watchFile(this.ccSwitchDbPath, 'CC-Switch Database', callback);
	}

	/**
	 * Watch a file for changes
	 */
	private watchFile(
		filePath: string,
		label: string,
		callback: (event: FileChangeEvent) => void
	): vscode.Disposable {
		const dir = path.dirname(filePath);
		const filename = path.basename(filePath);

		// Check if directory exists
		if (!fs.existsSync(dir)) {
			this.logService.warn(`[FileWatcherService] 目录不存在: ${dir}`);
			return new vscode.Disposable(() => {});
		}

		this.logService.info(`[FileWatcherService] 开始监听 ${label}: ${filePath}`);

		// Create file system watcher
		const pattern = new vscode.RelativePattern(dir, filename);
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		// Track last modification time to debounce events
		let lastModTime = 0;
		const debounceMs = 500; // Ignore events within 500ms of each other

		const handleChange = (uri: vscode.Uri, changeType: 'created' | 'modified' | 'deleted') => {
			const now = Date.now();

			// Debounce: ignore if too soon after last event
			if (now - lastModTime < debounceMs) {
				return;
			}
			lastModTime = now;

			this.logService.info(`[FileWatcherService] ${label} ${changeType}: ${uri.fsPath}`);

			const event: FileChangeEvent = {
				filePath: uri.fsPath,
				changeType,
				timestamp: new Date()
			};

			callback(event);
		};

		// Register event handlers
		const onDidCreate = watcher.onDidCreate(uri => handleChange(uri, 'created'));
		const onDidChange = watcher.onDidChange(uri => handleChange(uri, 'modified'));
		const onDidDelete = watcher.onDidDelete(uri => handleChange(uri, 'deleted'));

		// Return disposable that stops all watchers
		return new vscode.Disposable(() => {
			this.logService.info(`[FileWatcherService] 停止监听 ${label}`);
			watcher.dispose();
			onDidCreate.dispose();
			onDidChange.dispose();
			onDidDelete.dispose();
		});
	}
}
