import { Badge, Modal } from '@ig-live/ui';
import React from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';
import { useWaifuMessage } from '@/hooks/useWaifuMessage';
import { MESSAGES } from '@/mascot/tips';

/** 内置 VRM 角色选择器（缩略图网格 + 许可信息）。 */
export const ModelPicker: React.FC = () => {
  const { state, dispatch, selectModel } = useMascot();
  const { showMessage } = useWaifuMessage();
  if (!state.pickerOpen) return null;

  const close = () => dispatch({ type: 'SET_PICKER_OPEN', payload: false });

  return (
    <Modal open onClose={close} title="选择角色" data-testid="model-picker">
      <div className={styles.grid}>
        {state.modelList.map((m) => {
          const active = m.name === state.modelName;
          return (
            <button
              key={m.name}
              type="button"
              className={`${styles.card} ${active ? styles.active : ''}`}
              data-testid={`model-option-${m.name}`}
              aria-pressed={active}
              title={`${m.displayName} · ${m.author} · ${m.license}`}
              onClick={() => {
                selectModel(m.name);
                close();
                showMessage(MESSAGES.modelSwitched(m.displayName), 4000, 9);
              }}
            >
              {m.thumbnail ? (
                <img src={m.thumbnail} alt={m.displayName} className={styles.thumb} />
              ) : (
                <div className={styles.thumb} />
              )}
              <span className={styles.name}>{m.displayName}</span>
              <Badge tone={active ? 'accent' : 'neutral'}>{m.license}</Badge>
            </button>
          );
        })}
      </div>
      <p className={styles.credit}>内置角色均来自 pixiv VRoid 项目的 CC0 样例模型。</p>
    </Modal>
  );
};

export default ModelPicker;
