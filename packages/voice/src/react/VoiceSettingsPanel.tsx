/**
 * 语音输入设置：识别引擎 / 语言、本地模型管理（按需下载：进度、许可、来源、校验）、
 * 云端识别同意、免按键灵敏度、打断、唤醒词。全部只存本机。
 */
import { Badge, Button, FormField, Input, Notice, Select, Switch } from '@ig-live/ui';
import React, { useEffect, useState } from 'react';

import type { VoiceApi, VoiceAssetView, VoiceSettingsView, VoiceStateView } from '../bridge';

export interface VoiceSettingsPanelProps {
  api: VoiceApi;
  config: VoiceStateView | null;
  onRefresh(): void;
}

const LANGS = [
  { value: 'auto', label: '自动识别' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

export const fmtBytes = (n: number) =>
  n >= 1 << 30
    ? `${(n / (1 << 30)).toFixed(1)} GB`
    : n >= 1 << 20
      ? `${Math.round(n / (1 << 20))} MB`
      : `${Math.round(n / 1024)} KB`;

const AssetRow: React.FC<{
  a: VoiceAssetView;
  api: VoiceApi;
  selected?: boolean;
  onSelect?(): void;
  error?: string;
}> = ({ a, api, selected, onSelect, error }) => {
  const [confirming, setConfirming] = useState(false);
  const pct = a.downloading
    ? Math.min(100, Math.round((a.downloading.received / Math.max(1, a.downloading.total)) * 100))
    : 0;
  return (
    <div
      className="cd-voice-asset"
      data-testid={`voice-asset-${a.id}`}
      data-installed={a.installed}
    >
      <div className="cd-voice-asset__main">
        <div className="cd-voice-asset__title">
          {a.name}
          {a.installed && <Badge tone="success">已安装</Badge>}
          {selected && <Badge>使用中</Badge>}
        </div>
        <div className="cd-voice-asset__desc">
          {a.description} · {fmtBytes(a.bytes)} · 许可{' '}
          <a href={a.licenseUrl} target="_blank" rel="noreferrer">
            {a.license}
          </a>{' '}
          ·{' '}
          <a href={a.sourceUrl} target="_blank" rel="noreferrer">
            来源
          </a>
        </div>
        {a.downloading && (
          <div
            className="cd-voice-progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid={`voice-progress-${a.id}`}
          >
            <div className="cd-voice-progress__bar" style={{ width: `${pct}%` }} />
            <span>
              {pct}% · {fmtBytes(a.downloading.received)} / {fmtBytes(a.downloading.total)}
            </span>
          </div>
        )}
        {error && <div className="cd-voice-asset__error">{error}</div>}
        {confirming && (
          <Notice className="cd-voice-asset__confirm">
            将从 {new URL(a.sourceUrl).host} 下载 {fmtBytes(a.bytes)}（{a.license}{' '}
            许可），下载后校验 SHA-256，仅保存在本机。
            <div className="cd-voice-row">
              <Button
                size="sm"
                variant="primary"
                data-testid={`voice-download-confirm-${a.id}`}
                onClick={() => {
                  setConfirming(false);
                  void api.download(a.id);
                }}
              >
                同意许可并下载
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                取消
              </Button>
            </div>
          </Notice>
        )}
      </div>
      <div className="cd-voice-asset__actions">
        {a.downloading ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void api.cancel(a.id)}
            data-testid={`voice-cancel-${a.id}`}
          >
            取消
          </Button>
        ) : a.installed ? (
          <>
            {onSelect && !selected && (
              <Button size="sm" onClick={onSelect}>
                使用
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void api.remove(a.id)}
              data-testid={`voice-remove-${a.id}`}
            >
              删除
            </Button>
          </>
        ) : (
          !confirming && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirming(true)}
              data-testid={`voice-download-${a.id}`}
            >
              下载
            </Button>
          )
        )}
      </div>
    </div>
  );
};

export const VoiceSettingsPanel: React.FC<VoiceSettingsPanelProps> = ({
  api,
  config,
  onRefresh,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(
    () =>
      api.onProgress((e) => {
        if (e.phase === 'error') setErrors((x) => ({ ...x, [e.id]: `下载失败：${e.error ?? ''}` }));
        if (e.phase === 'start' || e.phase === 'done') setErrors((x) => ({ ...x, [e.id]: '' }));
        onRefresh();
      }),
    [api, onRefresh],
  );
  if (!config) return <div className="cd-voice-loading">加载语音设置…</div>;
  const s = config.settings;
  const set = (p: Partial<VoiceSettingsView>) => void api.setSettings(p).then(onRefresh);
  const engines = config.assets.filter((a) => a.kind === 'whisper-bin');
  const models = config.assets.filter((a) => a.kind === 'whisper-model');
  const vad = config.assets.filter((a) => a.kind === 'vad');
  const r = config.readiness;

  return (
    <div className="cd-voice-settings" data-testid="voice-settings">
      <Notice>
        🔒
        录音只在内存中处理，识别完立即丢弃，不保存音频。本地引擎完全离线；使用云端识别前会先征得你的同意。
      </Notice>

      <div className={`cd-voice-ready ${r.ok ? 'is-ok' : 'is-warn'}`} data-testid="voice-readiness">
        {r.ok
          ? `✅ 语音输入可用（${r.local ? '本地识别' : '云端识别'}）`
          : `⚠️ ${r.message ?? '尚未就绪'}`}
        {!r.ok && r.code === 'cloud_not_acked' && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void api.ackCloud().then(onRefresh)}
            data-testid="voice-ack-cloud"
          >
            同意发送录音
          </Button>
        )}
      </div>

      <div className="cd-voice-grid">
        <FormField label="识别引擎">
          <Select
            value={s.engine}
            onChange={(e) => set({ engine: e.target.value as VoiceSettingsView['engine'] })}
            options={[
              { value: 'whisper-cpp', label: '本地 whisper.cpp（离线，推荐）' },
              { value: 'openai-compat', label: 'OpenAI 兼容服务（云端 / 本地服务）' },
            ]}
            data-testid="voice-engine"
          />
        </FormField>
        <FormField label="语言">
          <Select
            value={s.language}
            onChange={(e) => set({ language: e.target.value })}
            options={LANGS}
            data-testid="voice-language"
          />
        </FormField>
      </div>

      {s.engine === 'whisper-cpp' ? (
        <section className="cd-voice-section">
          <h4>本地引擎</h4>
          <div className="cd-voice-hint" data-testid="voice-cli">
            {config.cli
              ? `whisper-cli：${config.cli.source === 'downloaded' ? '已下载' : config.cli.source === 'path' ? '系统 PATH' : '自定义路径'} · ${config.cli.path}`
              : engines.length
                ? '还没有 whisper.cpp 引擎，下载后即可离线识别。'
                : '本平台没有官方预编译包：macOS 请 `brew install whisper-cpp`（会自动找到），或在下方填写 whisper-cli 路径。'}
          </div>
          {engines.map((a) => (
            <AssetRow key={a.id} a={a} api={api} error={errors[a.id]} />
          ))}
          <FormField label="whisper-cli 路径（可选）" hint="留空则自动查找">
            <Input
              defaultValue={s.whisperCliPath}
              placeholder={
                config.platform.startsWith('win')
                  ? 'C:\\whisper\\whisper-cli.exe'
                  : '/opt/homebrew/bin/whisper-cli'
              }
              onBlur={(e) =>
                e.target.value !== s.whisperCliPath && set({ whisperCliPath: e.target.value })
              }
              data-testid="voice-cli-path"
            />
          </FormField>
          <h4>识别模型</h4>
          {models.map((a) => (
            <AssetRow
              key={a.id}
              a={a}
              api={api}
              selected={s.whisperModel === a.id}
              onSelect={() => set({ whisperModel: a.id })}
              error={errors[a.id]}
            />
          ))}
        </section>
      ) : (
        <section className="cd-voice-section">
          <h4>OpenAI 兼容识别服务</h4>
          <div className="cd-voice-grid">
            <FormField label="使用供应商" hint="使用其 API Key 调用 /audio/transcriptions">
              <Select
                value={s.customBaseURL ? '__custom' : s.providerId}
                placeholder="选择已保存的供应商"
                onChange={(e) =>
                  e.target.value === '__custom'
                    ? set({ customBaseURL: s.customBaseURL || 'http://127.0.0.1:8080/v1' })
                    : set({ providerId: e.target.value, customBaseURL: '' })
                }
                options={[
                  ...config.providers.map((p) => ({
                    value: p.id,
                    label: p.name,
                    description: p.local ? '本地' : '云端',
                  })),
                  { value: '__custom', label: '自定义地址（如本地 whisper.cpp server）' },
                ]}
                data-testid="voice-provider"
              />
            </FormField>
            <FormField label="模型" hint="如 whisper-1、gpt-4o-mini-transcribe">
              <Input
                defaultValue={s.cloudModel}
                onBlur={(e) =>
                  e.target.value !== s.cloudModel && set({ cloudModel: e.target.value })
                }
                data-testid="voice-cloud-model"
              />
            </FormField>
          </div>
          {s.customBaseURL && (
            <FormField label="服务地址" hint="填到 /v1 为止，会请求 {地址}/audio/transcriptions">
              <Input
                defaultValue={s.customBaseURL}
                onBlur={(e) => set({ customBaseURL: e.target.value })}
                data-testid="voice-custom-url"
              />
            </FormField>
          )}
        </section>
      )}

      <section className="cd-voice-section">
        <h4>交互</h4>
        <Switch
          checked={s.autoSend}
          onChange={(v) => set({ autoSend: v })}
          label="识别后自动发送（关闭则填入输入框，便于修改）"
          data-testid="voice-autosend"
        />
        <Switch
          checked={s.bargeIn}
          onChange={(v) => set({ bargeIn: v })}
          label="开口即打断看板娘说话（barge-in）"
          data-testid="voice-bargein"
        />
        <FormField
          label={`免按键灵敏度：${s.vadThreshold <= 0.4 ? '灵敏' : s.vadThreshold >= 0.65 ? '稳妥（嘈杂环境）' : '适中'}`}
          hint="越靠右越不容易被环境声误触发"
        >
          <input
            type="range"
            min={0.3}
            max={0.9}
            step={0.05}
            value={s.vadThreshold}
            onChange={(e) => set({ vadThreshold: Number(e.target.value) })}
            className="cd-voice-range"
            data-testid="voice-vad-threshold"
          />
        </FormField>
        {vad.map((a) => (
          <AssetRow key={a.id} a={a} api={api} error={errors[a.id]} />
        ))}
      </section>

      <section className="cd-voice-section">
        <h4>
          唤醒词 <Badge tone="neutral">实验</Badge>
        </h4>
        <div className="cd-voice-hint">
          开启后在后台持续监听麦克风（状态栏会一直显示「等待唤醒词」）。每句话只在本机用 whisper.cpp
          检查是否为唤醒词，从不上传；需要先下载本地引擎与模型。
        </div>
        <Switch
          checked={s.wakeWord.enabled}
          onChange={(v) => set({ wakeWord: { ...s.wakeWord, enabled: v } })}
          label="启用唤醒词"
          data-testid="voice-wake-enabled"
        />
        <div className="cd-voice-grid">
          <FormField label="唤醒词" hint="2~8 个字，中英文都可以；避免日常高频词">
            <Input
              defaultValue={s.wakeWord.phrase}
              maxLength={24}
              onBlur={(e) =>
                e.target.value.trim() &&
                set({ wakeWord: { ...s.wakeWord, phrase: e.target.value.trim() } })
              }
              data-testid="voice-wake-phrase"
            />
          </FormField>
          <FormField label="唤醒后等待指令（秒）">
            <Select
              value={String(s.wakeWord.windowSec)}
              onChange={(e) =>
                set({ wakeWord: { ...s.wakeWord, windowSec: Number(e.target.value) } })
              }
              options={[5, 8, 12, 20].map((n) => ({ value: String(n), label: `${n} 秒` }))}
            />
          </FormField>
        </div>
      </section>
    </div>
  );
};
