import React from 'react';
import styles from './style.module.css';

export const LoadingIndicator: React.FC = () => {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingSpinner}>
        <div className={styles.loadingBounce1}></div>
        <div className={styles.loadingBounce2}></div>
        <div className={styles.loadingBounce3}></div>
      </div>
      <div className={styles.loadingText}>加载中...</div>
    </div>
  );
}; 