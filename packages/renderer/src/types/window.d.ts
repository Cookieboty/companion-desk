/**
 * @file Define the type of the global window object.
 * @module types/window
 */
interface Window {
  /**
   * Asteroids game class.
   * @type {any}
   */
  Asteroids: any;
  /**
  * Asteroids game player array.
  * @type {any[]}
  */
  ASTEROIDSPLAYERS: any[];
  /**
   * Function to initialize the Live2D widget.
   * @type {(config: Config) => void}
   */
  initWidget: (config: Config) => void;
  /**
   * 是否启用拖动功能
   * @type {boolean}
   */
  drag?: boolean;
  /**
   * 拖动清理函数
   * @type {() => void}
   */
  cleanupDrag?: () => void;
  /**
   * 是否已经完成初始化
   * @type {boolean}
   */
  isInitialized?: boolean;
}
