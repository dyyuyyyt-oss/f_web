// 聊天图片上传相关的 API 封装
import { authFetch, extractErrorMessage } from './http'

/**
 * 上传聊天图片
 * @param {File} file 本地图片文件
 * @returns {Promise<{url: string}>} 上传后的图片访问 URL
 */
export async function uploadChatImage(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await authFetch('/api/upload/image', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, '上传图片失败'))
  }

  return response.json()
}
