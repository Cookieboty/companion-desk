/** 设置 → 通用 → 语言：跟随系统 / 中文 / English，切换即时生效（对话窗口、看板娘、托盘、通知同步）。 */
import { getLocalePref, setLocalePref, t, useLocale, type LocalePref } from '@nomi-ai/ui';
import React, { useEffect, useState } from 'react';

import styles from './index.module.css';

// 语言名始终用其本身的文字显示
// i18n-ignore
const ZH = '中文';

const OPTIONS: { id: LocalePref; label: () => string }[] = [
  { id: 'system', label: () => t('跟随系统') },
  { id: 'zh-CN', label: () => ZH },
  { id: 'en', label: () => 'English' },
];

export const LanguageSettings: React.FC = () => {
  const locale = useLocale();
  const [pref, setPref] = useState<LocalePref>(getLocalePref);
  useEffect(() => {
    const on = (e: Event) => setPref((e as CustomEvent<{ pref: LocalePref }>).detail.pref);
    window.addEventListener('cd:locale-changed', on);
    return () => window.removeEventListener('cd:locale-changed', on);
  }, []);
  return (
    <section className={styles.block} data-testid="language-settings">
      <h2 className={styles.h2}>{locale === 'zh-CN' ? t('语言') + ' · Language' : 'Language'}</h2>
      <div className={styles.langs} role="radiogroup" aria-label={t('语言')}>
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={pref === o.id}
            className={`${styles.lang} ${pref === o.id ? styles.langOn : ''}`}
            onClick={() => void setLocalePref(o.id)}
            data-testid={`locale-${o.id}`}
          >
            {o.label()}
            {o.id === 'system' && pref === 'system' && (
              <span className={styles.langHint}>{locale === 'zh-CN' ? ZH : 'English'}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};
