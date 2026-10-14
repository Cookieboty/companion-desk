/** 编程助手 CLI 版本检测 / 白名单更新 + 简易供应商启用 */
import { Button, Notice, t as tr } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { cliProviderClient, type CliProviderState } from '../../services/cliProviderClient';
import { cliUpdateClient, type CliInstallInfo } from '../../services/cliUpdateClient';

const KIND_LABEL = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
} as const;

export const CliToolsBlock: React.FC = () => {
  const [rows, setRows] = useState<CliInstallInfo[]>([]);
  const [prov, setProv] = useState<CliProviderState | null>(null);
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!cliUpdateClient.available()) return;
    void cliUpdateClient
      .inspect(true)
      .then(setRows)
      .catch(() => setRows([]));
    if (cliProviderClient.available()) {
      void cliProviderClient
        .state()
        .then(setProv)
        .catch(() => setProv(null));
    }
  }, []);

  useEffect(() => {
    refresh();
    return cliUpdateClient.onEvent(() => refresh());
  }, [refresh]);

  if (!cliUpdateClient.available()) return null;

  return (
    <div data-testid="cli-tools-block" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <p style={{ margin: 0, opacity: 0.8, fontSize: 13 }}>
        {tr('版本与更新（Claude Code / Codex 可更新；Cursor 仅检测）')}
      </p>
      {prov?.ccSwitchWarning && (
        <Notice tone="warning" data-testid="cc-switch-warn">
          {tr(
            '检测到本机安装了 cc-switch。Nomi 写入 CLI 配置前会自动备份；请避免两边同时改同一文件。',
          )}
        </Notice>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r) => (
          <div
            key={r.kind}
            data-testid={`cli-row-${r.kind}`}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              fontSize: 13,
            }}
          >
            <strong>{KIND_LABEL[r.kind]}</strong>
            <span>
              {r.version ? tr('已装 {0}', r.version) : tr('未安装')}
              {r.latest ? tr(' · 最新 {0}', r.latest) : ''}
              {r.updateAvailable ? tr(' · 有更新') : ''}
            </span>
            {r.updateSupported && r.path && (
              <Button
                size="sm"
                disabled={busy}
                data-testid={`cli-update-${r.kind}`}
                onClick={() => {
                  setBusy(true);
                  void (async () => {
                    const preview = await cliUpdateClient.preview(r.kind as 'claude' | 'codex');
                    if ('error' in preview) {
                      setLog(preview.error);
                      setBusy(false);
                      return;
                    }
                    if (!window.confirm(tr('将执行：{0}\n确定更新？', preview.argv.join(' ')))) {
                      setBusy(false);
                      return;
                    }
                    const res = await cliUpdateClient.run(r.kind as 'claude' | 'codex');
                    setLog(res.log.slice(0, 2000));
                    refresh();
                    setBusy(false);
                  })();
                }}
              >
                {tr('更新')}
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button size="sm" data-testid="cli-refresh" onClick={refresh}>
        {tr('检查更新')}
      </Button>
      {log && (
        <pre
          data-testid="cli-update-log"
          style={{ fontSize: 11, maxHeight: 120, overflow: 'auto' }}
        >
          {log}
        </pre>
      )}
    </div>
  );
};
