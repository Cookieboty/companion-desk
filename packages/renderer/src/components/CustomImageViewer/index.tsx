import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CustomImageInfo } from '@ig-live/types';
import styles from './style.module.css';

interface CustomImageViewerProps {
  imagePath?: string;
  imageInfo?: CustomImageInfo;
  style?: React.CSSProperties;
  className?: string;
  onImageError: () => void;
  onImageLoad?: () => void;
  enableDrag?: boolean;
  transparent?: boolean;
}

export const CustomImageViewer: React.FC<CustomImageViewerProps> = ({
  imagePath,
  imageInfo,
  style = {},
  className = '',
  onImageError,
  onImageLoad,
  enableDrag = true,
  transparent = true
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 加载图片
  useEffect(() => {
    if (!imagePath) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    // 将本地文件路径转换为可用的URL
    const fileUrl = `file://${imagePath}`;
    setImageUrl(fileUrl);
  }, [imagePath]);

  // 图片加载成功
  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onImageLoad?.();
  }, [onImageLoad]);

  // 图片加载失败
  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    console.error('自定义图片加载失败:', imagePath);
    onImageError();
  }, [imagePath, onImageError]);

  // 拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enableDrag) return;

    e.preventDefault();
    setIsDragging(true);

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left - position.x,
        y: e.clientY - rect.top - position.y
      });
    }
  }, [enableDrag, position]);

  // 拖拽过程
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !enableDrag) return;

    e.preventDefault();
    const newPosition = {
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    };

    setPosition(newPosition);

    // 通知Electron窗口移动
    if (window.electronAPI?.moveWindow) {
      window.electronAPI.moveWindow(e.movementX, e.movementY);
    }
  }, [isDragging, enableDrag, dragOffset]);

  // 拖拽结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 添加全局鼠标事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 如果没有图片路径，显示占位符
  if (!imagePath && !isLoading) {
    return (
      <div className={`${styles.viewer} ${className}`} style={style}>
        <div className={styles.placeholder}>
          <div className={styles.placeholderIcon}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
            </svg>
          </div>
          <div className={styles.placeholderText}>
            <h3>未设置自定义图片</h3>
            <p>点击工具栏切换到自定义图片模式</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.viewer} ${className} ${transparent ? styles.transparent : ''}`}
      style={style}
    >
      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>加载图片中...</span>
        </div>
      )}

      {hasError && (
        <div className={styles.error}>
          <div className={styles.errorIcon}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z" />
            </svg>
          </div>
          <div className={styles.errorText}>
            <h3>图片加载失败</h3>
            <p>请检查图片文件是否存在</p>
          </div>
        </div>
      )}

      {imageUrl && !hasError && (
        <div className={styles.imageContainer}>
          <img
            ref={imageRef}
            src={imageUrl}
            alt="自定义看板娘"
            className={`${styles.image} ${enableDrag ? styles.draggable : ''}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            onMouseDown={handleMouseDown}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              cursor: enableDrag ? (isDragging ? 'grabbing' : 'grab') : 'default'
            }}
            draggable={false}
          />

          {/* 图片信息覆盖层（仅在开发模式显示） */}
          {process.env.NODE_ENV === 'development' && imageInfo && (
            <div className={styles.imageInfo}>
              <div className={styles.infoItem}>
                <span>文件名:</span>
                <span>{imageInfo.fileName}</span>
              </div>
              <div className={styles.infoItem}>
                <span>大小:</span>
                <span>{(imageInfo.fileSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className={styles.infoItem}>
                <span>上传时间:</span>
                <span>{new Date(imageInfo.uploadTime).toLocaleString()}</span>
              </div>
              {imageInfo.dimensions && (
                <div className={styles.infoItem}>
                  <span>尺寸:</span>
                  <span>{imageInfo.dimensions.width} × {imageInfo.dimensions.height}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomImageViewer;
