/**
 * CC-Switch Integration Handlers
 */

import type { HandlerContext } from './types';
import type {
	GetCCSwitchStatusRequest,
	GetCCSwitchStatusResponse,
	OpenCCSwitchRequest,
	OpenCCSwitchResponse
} from '../../../shared/messages';

/**
 * 获取 CC-Switch 状态
 */
export async function handleGetCCSwitchStatus(
	_request: GetCCSwitchStatusRequest,
	context: HandlerContext
): Promise<GetCCSwitchStatusResponse> {
	const { ccSwitchService, logService } = context;

	logService.info('[handleGetCCSwitchStatus] 获取 CC-Switch 状态');

	const installed = ccSwitchService.isInstalled();
	let activeProvider = null;

	if (installed) {
		const provider = ccSwitchService.getActiveProvider();
		if (provider) {
			activeProvider = {
				id: provider.id,
				name: provider.name,
				baseUrl: provider.baseUrl
			};
		}
	}

	return {
		type: 'get_ccswitch_status_response',
		installed,
		activeProvider
	};
}

/**
 * 打开 CC-Switch 应用
 */
export async function handleOpenCCSwitch(
	_request: OpenCCSwitchRequest,
	context: HandlerContext
): Promise<OpenCCSwitchResponse> {
	const { ccSwitchService, logService } = context;

	logService.info('[handleOpenCCSwitch] 打开 CC-Switch 应用');

	try {
		await ccSwitchService.openCCSwitch();
		return {
			type: 'open_ccswitch_response',
			success: true
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logService.error('[handleOpenCCSwitch] 打开失败:', error);
		return {
			type: 'open_ccswitch_response',
			success: false,
			error: errorMessage
		};
	}
}
