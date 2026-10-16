/**
 * 设置 → 语音与屏幕（Nomi 听你说、看你屏幕的两种方式）：
 * 「语音」= 语音输入 / 朗读设置；「屏幕」= 截图提问、屏幕记忆与排除（原屏幕面板，交互不变）。
 */
import { t } from '@nomi-ai/ui';
import { VoiceSettingsPanel, useVoice } from '@nomi-ai/voice';
import React from 'react';

import { ScreenPanel } from '../lazyPanels';

import styles from './index.module.css';
import { SectionPage } from './SectionPage';
import { SECTION_TABS, type SensesTab } from './sections';

const noop = () => undefined;

const VoiceSection: React.FC = () => {
  const v = useVoice('chat');
  if (!v.api) return <p className={styles.note}>{t('语音服务不可用（仅在桌面应用中提供）。')}</p>;
  return (
    <section className={styles.block} data-testid="settings-voice">
      <h2 className={styles.h2}>{t('语音输入')}</h2>
      <VoiceSettingsPanel api={v.api} config={v.config} onRefresh={() => void v.refresh()} />
    </section>
  );
};

export const SensesSection: React.FC<{
  tab: SensesTab;
  onTab: (tab: SensesTab) => void;
}> = ({ tab, onTab }) => (
  <SectionPage
    testId="settings-senses"
    title="语音与屏幕"
    tabsLabel="语音与屏幕分区"
    intro={t('语音输入与朗读，以及截图提问、屏幕记忆：Nomi 听你说、看你屏幕的方式都在这里设置。')}
    tabs={SECTION_TABS.senses}
    value={tab}
    onChange={onTab}
  >
    {tab === 'voice' ? <VoiceSection /> : <ScreenPanel key="screen" isVisible onClose={noop} />}
  </SectionPage>
);
