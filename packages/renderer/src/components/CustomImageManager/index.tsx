import React, { useState, useCallback, useEffect } from 'react';
import { CustomImageInfo } from '@ig-live/types';
import CustomImageUploader from '../CustomImageUploader';
import CustomImageViewer from '../CustomImageViewer';
import styles from './style.module.css';

interface CustomImageManagerProps {
  className?: string;
  style?: React.CSSProperties;
  onModeChange?: (mode: 'live2d' | '3d' | 'custom-image') => void;
  onImageChange?: (imageInfo: CustomImageInfo | null) => void;
}

export const CustomImageManager: React.FC<CustomImageManagerProps> = ({
  className = '',
  style = {},
  onModeChange,
  onImageChange
}) => {
  const [hasCustomImage, setHasCustomImage] = useState(false);
  const [imageInfo, setImageInfo] = useState<CustomImageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载现有的自定义图片
  const loadExistingImage = useCallback(async () => {
    console.log('🔵 CustomImageManager: 开始加载现有图片');
    try {
      setIsLoading(true);
      setError(null);

      const result = await window.electronAPI.getCustomImage();
      console.log('🔵 CustomImageManager: getCustomImage结果', result);

      if (result.success && result.data?.imagePath && result.data?.imageInfo) {
        console.log('✅ CustomImageManager: 找到现有图片，设置状态');
        setHasCustomImage(true);
        setImageInfo(result.data.imageInfo);
        onImageChange?.(result.data.imageInfo);
      } else {
        console.log('⚠️  CustomImageManager: 没有找到现有图片');
        setHasCustomImage(false);
        setImageInfo(null);
        onImageChange?.(null);
      }
    } catch (error) {
      console.error('❌ CustomImageManager: 加载自定义图片失败:', error);
      setError('加载图片失败');
      setHasCustomImage(false);
      setImageInfo(null);
      onImageChange?.(null);
    } finally {
      setIsLoading(false);
    }
  }, []); // 移除onImageChange依赖，避免无限循环

  // 组件初始化时加载图片（只执行一次）
  useEffect(() => {
    loadExistingImage();
  }, []); // 空依赖数组，只在组件挂载时执行一次

  // 处理图片上传成功
  const handleImageSelect = useCallback(async (imagePath: string, newImageInfo: CustomImageInfo) => {
    console.log('🔵 CustomImageManager: 上传成功，更新状态', newImageInfo);

    setImageInfo(newImageInfo);
    setHasCustomImage(true);
    setError(null);

    console.log('🔵 CustomImageManager: 状态已更新，hasCustomImage=true');

    // 保存到配置
    try {
      await window.electronAPI.saveDisplayModeConfig({
        currentMode: 'custom-image',
        customImage: newImageInfo
      });
      console.log('✅ CustomImageManager: 配置保存成功');

      // 只在保存成功后才通知父组件
      onImageChange?.(newImageInfo);
    } catch (error) {
      console.error('❌ CustomImageManager: 保存配置失败:', error);
    }
  }, [onImageChange]);

  // 处理上传错误
  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000); // 5秒后自动清除错误
  }, []);

  // 处理图片加载错误
  const handleImageError = useCallback(() => {
    setError('图片加载失败，可能文件已损坏或被删除');
    setHasCustomImage(false);
    setImageInfo(null);
    onImageChange?.(null);
  }, [onImageChange]);



  // 删除自定义图片
  const handleDeleteImage = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.deleteCustomImage();

      if (result.success) {
        setHasCustomImage(false);
        setImageInfo(null);
        setShowDeleteConfirm(false);
        onImageChange?.(null);

        // 自动切换到Live2D模式
        await window.electronAPI.setCurrentMode('live2d');
        onModeChange?.('live2d');
      } else {
        setError(result.error || '删除图片失败');
      }
    } catch (error) {
      console.error('删除图片失败:', error);
      setError('删除图片失败');
    } finally {
      setIsLoading(false);
    }
  }, [onImageChange, onModeChange]);

  // 确认删除
  const handleConfirmDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  // 取消删除
  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  if (isLoading) {
    return (
      <div className={`${styles.manager} ${className}`} style={style}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.manager} ${className}`} style={style}>
      {/* 错误提示 */}
      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}



      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className={styles.confirmModal}>
          <div className={styles.confirmDialog}>
            <h3>确认删除</h3>
            <p>确定要删除当前的自定义图片吗？</p>
            <p className={styles.warning}>删除后将自动切换到Live2D模式</p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={handleCancelDelete}
              >
                取消
              </button>
              <button
                className={styles.deleteButton}
                onClick={handleDeleteImage}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主要内容区域 */}
      {!showDeleteConfirm && (
        <>
          {(() => {
            console.log('🔵 CustomImageManager: 渲染判断', { hasCustomImage, imageInfo: !!imageInfo });
            return hasCustomImage && imageInfo;
          })() ? (
            // 显示自定义图片
            <div className={styles.imageDisplay}>
              <CustomImageViewer
                imagePath={imageInfo!.imagePath}
                imageInfo={imageInfo!}
                onImageError={handleImageError}
                enableDrag={true}
                transparent={true}
              />

              {/* 图片管理工具栏 */}
              <div className={styles.toolbar}>
                <div className={styles.imageInfoDisplay}>
                  <span className={styles.fileName}>{imageInfo!.fileName}</span>
                  <span className={styles.fileSize}>
                    {(imageInfo!.fileSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>

                <div className={styles.toolbarActions}>


                  <button
                    className={styles.deleteButton}
                    onClick={handleConfirmDelete}
                    title="删除自定义图片"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                    </svg>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // 直接显示上传界面
            (() => {
              console.log('🔵 CustomImageManager: 显示上传界面');
              return (
                <CustomImageUploader
                  onImageSelect={handleImageSelect}
                  onError={handleUploadError}
                />
              );
            })()
          )}
        </>
      )}
    </div>
  );
};

export default CustomImageManager;
