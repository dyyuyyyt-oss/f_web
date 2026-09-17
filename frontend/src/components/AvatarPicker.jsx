import { useState } from 'react'
import { uploadAvatar } from '../api/characters'
import { resolveApiUrl } from '../api/config'

// 头像选择器：支持从本地选择图片文件并上传，上传成功后通过 onUploaded 回调返回图片 URL
export default function AvatarPicker({ previewUrl, onUploaded }) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 清空以允许重复选择同一文件
    if (!file) return

    setError('')
    setIsUploading(true)
    try {
      const { url } = await uploadAvatar(file)
      onUploaded(url)
    } catch (err) {
      setError(err.message || '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 shrink-0">
        {previewUrl ? (
          <img src={resolveApiUrl(previewUrl)} alt="头像预览" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">🙂</span>
        )}
      </div>
      <div>
        <label className="inline-block px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
          {isUploading ? '上传中...' : '从电脑选择图片'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
          />
        </label>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  )
}
