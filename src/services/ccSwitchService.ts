/**
 * CC-Switch Integration Service
 *
 * Reads provider configurations from cc-switch SQLite database
 * Provides read-only access to provider information
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const ICCSwitchService = createDecorator<ICCSwitchService>('ccSwitchService');

/**
 * CC-Switch Provider Configuration
 */
export interface CCSwitchProvider {
	id: number;
	name: string;
	apiKey: string;
	baseUrl?: string;
	isActive: boolean;
	preset?: string;
	models?: {
		haiku?: string;
		sonnet?: string;
		opus?: string;
		custom?: string;
	};
	createdAt?: string;
	updatedAt?: string;
}

/**
 * CC-Switch Service Interface
 */
export interface ICCSwitchService {
	readonly _serviceBrand: undefined;

	/**
	 * Check if cc-switch is installed
	 */
	isInstalled(): boolean;

	/**
	 * Get all providers from cc-switch database
	 */
	getProviders(): CCSwitchProvider[];

	/**
	 * Get the currently active provider
	 */
	getActiveProvider(): CCSwitchProvider | null;

	/**
	 * Get database path
	 */
	getDatabasePath(): string;

	/**
	 * Open CC-Switch application
	 */
	openCCSwitch(): Promise<void>;
}

/**
 * CC-Switch Service Implementation
 */
export class CCSwitchService implements ICCSwitchService {
	readonly _serviceBrand: undefined;

	private readonly dbPath: string;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		// CC-Switch database location: ~/.cc-switch/cc-switch.db
		this.dbPath = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');
		this.logService.info('[CCSwitchService] 已初始化');
		this.logService.info(`[CCSwitchService] 数据库路径: ${this.dbPath}`);
	}

	/**
	 * Check if cc-switch is installed
	 */
	isInstalled(): boolean {
		return fs.existsSync(this.dbPath);
	}

	/**
	 * Get database path
	 */
	getDatabasePath(): string {
		return this.dbPath;
	}

	/**
	 * Get all providers from cc-switch database
	 */
	getProviders(): CCSwitchProvider[] {
		if (!this.isInstalled()) {
			this.logService.warn('[CCSwitchService] CC-Switch 未安装');
			return [];
		}

		try {
			const db = new Database(this.dbPath, { readonly: true });

			try {
				// Query providers table
				const rows = db.prepare('SELECT * FROM providers ORDER BY id').all() as any[];

				const providers: CCSwitchProvider[] = rows.map(row => ({
					id: row.id,
					name: row.name || 'Unknown',
					apiKey: row.api_key || '',
					baseUrl: row.base_url || undefined,
					isActive: row.is_active === 1,
					preset: row.preset || undefined,
					models: row.models ? this.parseModels(row.models) : undefined,
					createdAt: row.created_at,
					updatedAt: row.updated_at
				}));

				this.logService.info(`[CCSwitchService] 读取到 ${providers.length} 个 providers`);
				return providers;
			} finally {
				db.close();
			}
		} catch (error) {
			this.logService.error('[CCSwitchService] 读取 providers 失败:', error);
			return [];
		}
	}

	/**
	 * Get the currently active provider
	 */
	getActiveProvider(): CCSwitchProvider | null {
		const providers = this.getProviders();
		const active = providers.find(p => p.isActive);

		if (active) {
			this.logService.info(`[CCSwitchService] 当前活跃 provider: ${active.name}`);
		} else {
			this.logService.info('[CCSwitchService] 没有活跃的 provider');
		}

		return active || null;
	}

	/**
	 * Open CC-Switch application
	 */
	async openCCSwitch(): Promise<void> {
		try {
			const { exec } = require('child_process');
			const platform = process.platform;

			let command: string;

			if (platform === 'darwin') {
				// macOS: Try to open CC-Switch app
				command = 'open -a "CC-Switch" || open -a "cc-switch"';
			} else if (platform === 'win32') {
				// Windows: Try to find CC-Switch executable
				command = 'start "" "CC-Switch.exe" || start "" "cc-switch.exe"';
			} else {
				// Linux: Try common executable names
				command = 'cc-switch || CC-Switch || flatpak run com.ccswitch.app';
			}

			exec(command, (error: Error | null) => {
				if (error) {
					this.logService.warn('[CCSwitchService] 无法自动打开 CC-Switch, 请手动启动');
					throw new Error('无法打开 CC-Switch，请确认应用已安装');
				} else {
					this.logService.info('[CCSwitchService] 已打开 CC-Switch 应用');
				}
			});
		} catch (error) {
			this.logService.error('[CCSwitchService] 打开 CC-Switch 失败:', error);
			throw error;
		}
	}

	/**
	 * Parse models JSON from database
	 */
	private parseModels(modelsJson: string): any {
		try {
			return JSON.parse(modelsJson);
		} catch {
			return undefined;
		}
	}
}
