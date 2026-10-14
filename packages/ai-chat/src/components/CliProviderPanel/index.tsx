/**
 * Claude Code / Codex 各自独立的供应商档案 UI（与 Nomi「供应商与模型」完全分离）。
 */
import { Button, Notice, Select, t as tr } from '@nomi-ai/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  cliProviderClient,
  cliRouteClient,
  type ClaudeApiFormat,
  type CliProviderProfile,
  type CliProviderState,
  type CliRouteSettings,
  type CodexApiFormat,
} from '../../services/cliProviderClient';

const CLAUDE_FORMATS: Array<{ value: ClaudeApiFormat; label: string }> = [
  { value: 'anthropic_messages', label: 'Anthropic Messages（原生）' },
  { value: 'openai_chat_completions', label: 'OpenAI Chat Completions（需开启路由）' },
  { value: 'openai_responses', label: 'OpenAI Responses API（需开启路由）' },
  { value: 'gemini_generate_content', label: 'Gemini Native generateContent（需开启路由）' },
];

const CODEX_FORMATS: Array<{ value: CodexApiFormat; label: string }> = [
  { value: 'openai_responses', label: 'Responses（原生）' },
  { value: 'openai_chat_completions', label: 'Chat Completions（需开启路由）' },
  { value: 'anthropic_messages', label: 'Anthropic Messages（需开启路由）' },
];

type Tab = 'claude' | 'codex';

export const CliProviderPanel: React.FC = () => {
  const [tab, setTab] = useState<Tab>('claude');
  const [state, setState] = useState<CliProviderState | null>(null);
  const [route, setRoute] = useState<CliRouteSettings | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiFormat, setApiFormat] = useState<string>('anthropic_messages');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!cliProviderClient.available()) return;
    void cliProviderClient
      .state()
      .then((s) => {
        setState(s);
        setRoute(s.routing);
      })
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    refresh();
    return cliProviderClient.onChanged((s) => {
      setState(s);
      setRoute(s.routing);
    });
  }, [refresh]);

  useEffect(() => {
    setApiFormat(tab === 'claude' ? 'anthropic_messages' : 'openai_responses');
    setName('');
    setBaseUrl('');
    setModel('');
    setApiKey('');
    setMsg('');
  }, [tab]);

  const profiles = useMemo(
    () => (state?.profiles ?? []).filter((p) => p.kind === tab),
    [state, tab],
  );
  const formats = tab === 'claude' ? CLAUDE_FORMATS : CODEX_FORMATS;

  if (!cliProviderClient.available()) return null;

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await cliProviderClient.upsert({
        kind: tab,
        name: name || (tab === 'claude' ? 'Claude' : 'Codex'),
        baseUrl,
        model,
        apiFormat: apiFormat as ClaudeApiFormat | CodexApiFormat,
        apiKey: apiKey || undefined,
      });
      setApiKey('');
      setMsg(tr('已保存档案'));
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (p: CliProviderProfile) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await cliProviderClient.activate(p.id);
      if (!r.ok) setMsg(r.error || tr('启用失败'));
      else
        setMsg(
          r.usedRouting
            ? tr('已启用（经本地路由）')
            : r.restartRequired
              ? tr('已写入配置；Codex 可能需要重启会话')
              : tr('已启用'),
        );
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const patchRoute = async (patch: Partial<CliRouteSettings>) => {
    setBusy(true);
    try {
      const s = await cliRouteClient.set(patch);
      setRoute(s);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="cli-provider-panel" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{tr('编程助手供应商（与 Nomi 供应商分离）')}</p>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
        {tr(
          'Claude Code 写 ~/.claude/settings.json；Codex 写 ~/.codex/config.toml；Nomi 自有配置在 ai-providers.json。',
        )}
      </p>

      <div style={{ display: 'flex', gap: 8 }} data-testid="cli-provider-tabs">
        <Button
          size="sm"
          variant={tab === 'claude' ? 'primary' : 'ghost'}
          onClick={() => setTab('claude')}
        >
          Claude Code
        </Button>
        <Button
          size="sm"
          variant={tab === 'codex' ? 'primary' : 'ghost'}
          onClick={() => setTab('codex')}
        >
          Codex
        </Button>
      </div>

      <div data-testid={`cli-provider-list-${tab}`} style={{ display: 'grid', gap: 6 }}>
        {profiles.length === 0 && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>{tr('暂无档案')}</span>
        )}
        {profiles.map((p) => (
          <div
            key={p.id}
            data-testid={`cli-provider-row-${p.id}`}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              fontSize: 13,
              border: '1px solid var(--cd-border, #3333)',
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            <strong>{p.name}</strong>
            {p.active && <span data-testid="cli-provider-active">{tr('使用中')}</span>}
            {p.needsRouting && (
              <span data-testid="cli-provider-needs-routing" style={{ opacity: 0.8 }}>
                {tr('需路由')}
              </span>
            )}
            <span style={{ opacity: 0.7 }}>{p.apiFormat}</span>
            <span style={{ opacity: 0.7 }}>{p.model}</span>
            <Button size="sm" disabled={busy || p.active} onClick={() => void activate(p)}>
              {tr('启用')}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void cliProviderClient.remove(p.id).then(refresh);
              }}
            >
              {tr('删除')}
            </Button>
          </div>
        ))}
      </div>

      <div
        data-testid="cli-provider-form"
        style={{
          display: 'grid',
          gap: 8,
          padding: 10,
          borderRadius: 8,
          background: 'var(--cd-surface-2, #8881)',
        }}
      >
        <label style={{ fontSize: 12 }}>
          {tr('名称')}
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: 12 }}>
          {tr('API 地址')}
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…"
            style={{ width: '100%' }}
            data-testid="cli-provider-baseurl"
          />
        </label>
        <label style={{ fontSize: 12 }}>
          {tr('模型')}
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          {tr('API Key')}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: '100%' }}
            autoComplete="off"
          />
        </label>
        <div style={{ fontSize: 12 }}>
          {tr('上游格式')}
          <Select
            size="sm"
            data-testid="cli-provider-format"
            value={apiFormat}
            onChange={(e) => setApiFormat(e.target.value)}
            options={formats.map((f) => ({ value: f.value, label: tr(f.label) }))}
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !baseUrl.trim()}
          onClick={() => void save()}
          data-testid="cli-provider-save"
        >
          {tr('添加档案')}
        </Button>
      </div>

      <div
        data-testid="cli-route-advanced"
        style={{
          display: 'grid',
          gap: 8,
          padding: 10,
          borderRadius: 8,
          border: '1px dashed var(--cd-border, #3335)',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>{tr('高级设置 · 本地路由')}</p>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
          {tr('非原生上游格式时，CLI 仍发原生协议；由本机路由转换后再转发。')}
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={Boolean(route?.enabled)}
            data-testid="cli-route-enabled"
            onChange={(e) => void patchRoute({ enabled: e.target.checked })}
          />
          {tr('开启路由')}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={Boolean(route?.claude)}
            disabled={!route?.enabled}
            data-testid="cli-route-claude"
            onChange={(e) => void patchRoute({ claude: e.target.checked })}
          />
          {tr('接管 Claude Code')}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={Boolean(route?.codex)}
            disabled={!route?.enabled}
            data-testid="cli-route-codex"
            onChange={(e) => void patchRoute({ codex: e.target.checked })}
          />
          {tr('接管 Codex')}
        </label>
        {route?.listenUrl && (
          <span style={{ fontSize: 12 }} data-testid="cli-route-url">
            {tr('监听')} {route.listenUrl}
          </span>
        )}
      </div>

      {msg && (
        <Notice tone="info" data-testid="cli-provider-msg">
          {msg}
        </Notice>
      )}
      {state && (
        <pre style={{ fontSize: 10, opacity: 0.6, margin: 0 }} data-testid="cli-provider-paths">
          {`Nomi: ai-providers.json\nClaude store: ${state.claudeStore}\nCodex store: ${state.codexStore}\nClaude writes: ${state.claudeSettings}\nCodex writes: ${state.codexConfig}`}
        </pre>
      )}
    </div>
  );
};
