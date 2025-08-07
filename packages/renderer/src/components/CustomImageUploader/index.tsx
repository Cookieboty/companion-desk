import React, { useState, useRef, useCallback } from 'react';
import { CustomImageInfo } from '@ig-live/types';
import styles from './style.module.css';

interface CustomImageUploaderProps {
  onImageSelect: (imagePath: string, imageInfo: CustomImageInfo) => void;
  onError: (error: string) => void;
  onCancel?: () => void;
  className?: string;
}

export const CustomImageUploader: React.FC<CustomImageUploaderProps> = ({
  onImageSelect,
  onError,
  onCancel,
  className = ''
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // 统一的上传函数
  const handleUploadFile = useCallback(async (filePath: string) => {
    console.log('🔵 handleUploadFile 开始:', { filePath });

    try {
      setIsUploading(true);
      console.log('🔵 开始保存自定义图片:', filePath);

      const result = await window.electronAPI.saveCustomImage(filePath);
      console.log('🔵 saveCustomImage 返回结果:', result);

      if (result.success && result.data?.savedPath && result.data?.imageInfo) {
        console.log('✅ 上传成功:', {
          savedPath: result.data.savedPath,
          imageInfo: result.data.imageInfo
        });
        onImageSelect(result.data.savedPath, result.data.imageInfo);
      } else {
        console.error('❌ 上传失败:', result);
        onError(result.error || '保存图片失败');
      }
    } catch (error) {
      console.error('❌ 上传图片异常:', error);
      onError('上传图片失败');
    } finally {
      setIsUploading(false);
    }
  }, [onImageSelect, onError]);

  // 点击选择文件
  const handleClickSelect = useCallback(async (e?: React.MouseEvent) => {
    // 防止重复触发
    if (isUploading) {
      console.log('⚠️  正在上传中，忽略点击');
      e?.preventDefault();
      e?.stopPropagation();
      return;
    }

    try {
      console.log('🔵 开始选择文件...');
      const result = await window.electronAPI.selectImageFile();
      console.log('🔵 selectImageFile 返回结果:', result);

      if (result.success && result.data?.filePath) {
        console.log('✅ 文件选择成功:', result.data.filePath);

        // 立即上传
        console.log('🔵 开始立即上传...');
        await handleUploadFile(result.data.filePath);
      } else if (result.error && !result.error.includes('用户取消')) {
        console.error('❌ 文件选择失败:', result.error);
        onError(result.error);
      }
    } catch (error) {
      console.error('❌ 选择文件异常:', error);
      onError('选择文件失败');
    }
  }, [isUploading, onError, handleUploadFile]);

  // 拖拽事件处理
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    console.log('🔵 拖拽放下事件开始...');
    const files = e.dataTransfer.files;
    console.log('🔵 拖拽文件列表:', files);

    if (files && files.length > 0) {
      const file = files[0];
      console.log('🔵 选中的文件:', { name: file.name, type: file.type, size: file.size, path: (file as any).path });

      if (!file.type.startsWith('image/')) {
        console.error('❌ 文件类型不正确:', file.type);
        onError('请选择图片文件');
        return;
      }

      // 在Electron中，拖拽的文件对象包含path属性
      const filePath = (file as any).path;
      if (filePath) {
        console.log('✅ 设置拖拽文件路径:', filePath);

        // 立即上传
        console.log('🔵 开始拖拽立即上传...');
        await handleUploadFile(filePath);
      } else {
        console.error('❌ 无法从拖拽文件获取路径，使用选择文件API');
        // 回退到文件选择API
        handleClickSelect();
      }
    }
  }, [onError, handleClickSelect]);

  return (
    <div className={`${styles.uploader} ${className}`}>
      {/* 上传界面 */}
      <div
        className={`${styles.uploadArea} ${dragActive ? styles.dragActive : ''} ${isUploading ? styles.uploading : ''}`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClickSelect}
      >
        <div className={styles.uploadContent}>
          <div className={styles.uploadIcon}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
            </svg>
          </div>
          <div className={styles.uploadText}>
            <h3>{isUploading ? '正在上传...' : '上传自定义图片'}</h3>
            <p>{isUploading ? '请稍候，正在处理图片' : '点击选择或拖拽图片文件'}</p>
            <p className={styles.supportedFormats}>
              支持格式: JPG, PNG, GIF, WebP
            </p>
          </div>
        </div>
        {isUploading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner}></div>
            <span>上传中...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomImageUploader;
