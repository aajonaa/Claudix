import type { DropdownItemType } from '../types/dropdown'
import type { RuntimeInstance } from '../composables/useRuntime'

/**
 * 文件引用项
 */
export interface FileReference {
  path: string
  name: string
  type: 'file' | 'directory'
}

/**
 * 获取文件列表
 * @param query 搜索查询
 * @param runtime Runtime 实例
 * @returns 文件引用数组
 */
export async function getFileReferences(
  query: string,
  runtime: RuntimeInstance | undefined
): Promise<FileReference[]> {
  if (!runtime) {
    console.warn('[fileReferenceProvider] No runtime available')
    return []
  }

  try {
    const connection = await runtime.connectionManager.get()

    // 对空查询使用 '*' 默认模式，让后端列出前 N 个结果（上限 200）
    const pattern = (query && query.trim()) ? query : '*'
    const response = await connection.listFiles(pattern)

    // response.files 格式：{ path, name, type }
    return response.files || []
  } catch (error) {
    console.error('[fileReferenceProvider] Failed to list files:', error)
    return []
  }
}

/**
 * 将文件引用转换为 DropdownItem 格式
 */
export function fileToDropdownItem(file: FileReference): DropdownItemType {
  return {
    id: `file-${file.path}`,
    type: 'item',
    label: file.name,
    detail: file.path,
    // 不设置 icon，交由 FileIcon 组件根据 isDirectory/folderName 匹配
    data: {
      file
    }
  }
}
