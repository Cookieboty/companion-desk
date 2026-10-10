import { Badge, Modal } from '@ig-live/ui';
import React, { useEffect, useState } from 'react';

import styles from './style.module.css';

import { useMascot } from '@/contexts/MascotContext';
import { loadMotionLibrary } from '@/mascot/motion/library';

interface CreditRow {
  key: string;
  title: string;
  author: string;
  license: string;
  source?: string;
  note?: string;
}

/** 署名要求（CC-BY 等）必须展示作者；CC0 也一并列出以示感谢。 */
export function collectCredits(
  models: Array<{
    name: string;
    displayName: string;
    author: string;
    license: string;
    source?: string;
  }>,
  motionSources: Array<{ source: string; license: string }>,
): CreditRow[] {
  const rows: CreditRow[] = models.map((m) => ({
    key: `model-${m.name}`,
    title: m.displayName,
    author: m.author,
    license: m.license,
    source: m.source,
  }));
  const ual = motionSources.filter((s) => s.source.startsWith('Quaternius'));
  if (ual.length) {
    rows.push({
      key: 'motions-ual',
      title: `身体动作（${ual.length} 个片段，重定向到 VRM）`,
      author: 'Quaternius — Universal Animation Library',
      license: 'CC0-1.0',
      source: 'https://quaternius.com/packs/universalanimationlibrary.html',
    });
  }
  const own = motionSources.filter((s) => !s.source.startsWith('Quaternius'));
  if (own.length) {
    rows.push({
      key: 'motions-own',
      title: `手势动作（${own.length} 个）`,
      author: 'Companion Desk contributors',
      license: 'MIT',
    });
  }
  rows.push({
    key: 'icon',
    title: '应用图标',
    author: 'Cookieboty',
    license: 'First-party',
    note: '作者原创，保留所有权利',
  });
  return rows;
}

/** 致谢 / Credits：列出所有内置角色、动作与图标的作者与许可。 */
export const Credits: React.FC = () => {
  const { state, dispatch } = useMascot();
  const [motionSources, setMotionSources] = useState<Array<{ source: string; license: string }>>(
    [],
  );
  const open = state.panel === 'credits';
  useEffect(() => {
    if (!open) return;
    loadMotionLibrary()
      .then((lib) =>
        setMotionSources(lib.clips.map((c) => ({ source: c.source, license: c.license }))),
      )
      .catch(() => setMotionSources([]));
  }, [open]);
  if (!open) return null;
  const rows = collectCredits(state.modelList, motionSources);

  return (
    <Modal
      open
      onClose={() => dispatch({ type: 'SET_PANEL', payload: null })}
      title="致谢 / Credits"
      data-testid="credits"
    >
      <ul className={styles.credits}>
        {rows.map((r) => (
          <li key={r.key} data-testid={`credit-${r.key}`}>
            <div className={styles.creditHead}>
              <strong>{r.title}</strong>
              <Badge tone={r.license.startsWith('CC-BY') ? 'accent' : 'neutral'}>{r.license}</Badge>
            </div>
            <div className={styles.creditMeta}>
              {r.author}
              {r.note ? ` · ${r.note}` : ''}
            </div>
            {r.source && <div className={styles.creditSource}>{r.source}</div>}
          </li>
        ))}
      </ul>
      <p className={styles.credit}>完整清单见 THIRD_PARTY_NOTICES.md 与 assets-licenses.json。</p>
    </Modal>
  );
};

export default Credits;
