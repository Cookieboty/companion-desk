import React from 'react';

export const LoadingIndicator: React.FC = () => {
  return (
    <div className="waifu-loading">
      <div className="waifu-loading-spinner">
        <div className="waifu-loading-bounce1"></div>
        <div className="waifu-loading-bounce2"></div>
        <div className="waifu-loading-bounce3"></div>
      </div>
      <div className="waifu-loading-text">加载中...</div>
    </div>
  );
}; 