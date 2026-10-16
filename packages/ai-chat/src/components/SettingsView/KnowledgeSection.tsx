/**
 * 设置 → 知识与记忆：合并原「知识库」「记忆」两个分区，用标签页容纳两块（面板与交互不变）。
 * 知识库 = 你加入的文件夹与笔记的索引；长期记忆 = 从对话里沉淀的摘要 / 关于我 / 用户档案。
 * 两者都只存本机，提问时一起被检索并标出引用，所以放在一页里统一说明。
 */
import { t } from '@nomi-ai/ui';
import React from 'react';

import { KnowledgePanel, MemoryPanel } from '../lazyPanels';

import { SectionPage } from './SectionPage';
import { SECTION_TABS, type KnowledgeTab } from './sections';

const noop = () => undefined;

export const KnowledgeSection: React.FC<{
  tab: KnowledgeTab;
  onTab: (tab: KnowledgeTab) => void;
}> = ({ tab, onTab }) => (
  <SectionPage
    testId="settings-knowledge"
    title="知识与记忆"
    tabsLabel="知识与记忆分区"
    intro={t(
      '知识库来自你加入的文件夹和笔记，长期记忆来自你和 Nomi 的对话；提问时两者会一起被检索，并在回答里标出引用。都只保存在本机。',
    )}
    tabs={SECTION_TABS.knowledge}
    value={tab}
    onChange={onTab}
  >
    {tab === 'kb' ? (
      <KnowledgePanel key="kb" isVisible onClose={noop} />
    ) : (
      <MemoryPanel key="memory" isVisible onClose={noop} />
    )}
  </SectionPage>
);
