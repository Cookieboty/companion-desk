import React from 'react';
import styles from './index.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onNewChat }) => {
  return (
    <div className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {/* 侧边栏头部 */}
      <div className={styles.sidebarHeader}>
        {!collapsed && (
          <div className={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <defs>
                <linearGradient id="brainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <path fill="url(#brainGradient)" d="M12 2C8.5 2 5.7 4.6 5.2 8c-.3.1-.6.2-.9.4-1.4.8-2.3 2.3-2.3 3.9 0 1.2.5 2.3 1.3 3.1.2.2.4.4.7.5v.1c0 2.8 2.2 5 5 5h6c2.8 0 5-2.2 5-5v-.1c.3-.1.5-.3.7-.5.8-.8 1.3-1.9 1.3-3.1 0-1.6-.9-3.1-2.3-3.9-.3-.2-.6-.3-.9-.4C18.3 4.6 15.5 2 12 2z" />
              <circle cx="9" cy="10" r="1.5" fill="white" opacity="0.9" />
              <circle cx="15" cy="10" r="1.5" fill="white" opacity="0.9" />
              <path d="M8 14c0 2.2 1.8 4 4 4s4-1.8 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.8" />
              <path d="M7 7c1-1 2.5-1 3.5 0M13.5 7c1-1 2.5-1 3.5 0" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
            </svg>
            <span className={styles.logoText}>智能助手</span>
          </div>
        )}
      </div>

      {/* 新对话按钮 */}
      <div className={styles.newChatSection}>
        <button
          className={`${styles.newChatBtn} ${collapsed ? styles.collapsed : ''}`}
          onClick={onNewChat}
          title="开始新对话"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          {!collapsed && <span>新对话</span>}
        </button>
      </div>

      {/* 对话历史 */}
      {!collapsed && (
        <div className={styles.chatHistory}>
          <div className={styles.historyHeader}>
            <h3>最近对话</h3>
          </div>
          <div className={styles.historyList}>
            <div className={styles.historyItem}>
              <div className={styles.historyTitle}>关于React的问题</div>
              <div className={styles.historyTime}>2小时前</div>
            </div>
            <div className={styles.historyItem}>
              <div className={styles.historyTitle}>JavaScript异步编程</div>
              <div className={styles.historyTime}>昨天</div>
            </div>
            <div className={styles.historyItem}>
              <div className={styles.historyTitle}>CSS布局技巧</div>
              <div className={styles.historyTime}>3天前</div>
            </div>
          </div>
        </div>
      )}

      {/* 侧边栏底部 */}
      <div className={styles.sidebarFooter}>
        <div className={styles.userSection}>
          {!collapsed && (
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <div className={styles.userName}>用户</div>
            </div>
          )}
          <button
            className={styles.toggleButton}
            onClick={onToggle}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              {collapsed ? (
                <path d="M9 18l6-6-6-6v12z" />
              ) : (
                <path d="M15 18l-6-6 6-6v12z" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}; 