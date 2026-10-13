/** 设置 → 通用 → 主题：四套配色并排预览，点选即时生效（对话窗口与看板娘同步）。 */
import { THEMES, currentTheme, setTheme, type ThemeId } from '@ig-live/ui';
import React, { useEffect, useState } from 'react';

import styles from './index.module.css';

export const ThemeSettings: React.FC = () => {
  const [cur, setCur] = useState<ThemeId>(currentTheme);
  useEffect(() => {
    const on = (e: Event) => setCur((e as CustomEvent<ThemeId>).detail);
    window.addEventListener('cd:theme-changed', on);
    return () => window.removeEventListener('cd:theme-changed', on);
  }, []);
  return (
    <section className={styles.block} data-testid="theme-settings">
      <h2 className={styles.h2}>主题</h2>
      <div className={styles.themes} role="radiogroup" aria-label="主题">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={cur === t.id}
            className={`${styles.theme} ${cur === t.id ? styles.themeOn : ''}`}
            onClick={() => void setTheme(t.id)}
            data-testid={`theme-${t.id}`}
          >
            <span
              className={styles.themePreview}
              style={{ background: t.swatch[0], borderColor: t.swatch[1] }}
              aria-hidden
            >
              <span style={{ background: t.swatch[1] }} className={styles.themeCard}>
                <span style={{ background: t.swatch[2] }} className={styles.themeLine} />
                <span
                  style={{ background: t.swatch[2], opacity: 0.45 }}
                  className={styles.themeLine}
                />
                <span style={{ background: t.swatch[3] }} className={styles.themeDot} />
              </span>
            </span>
            <span className={styles.themeName}>{t.name}</span>
            <span className={styles.themeDesc}>{t.desc}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
