/**
 * 新建 / 编辑供应商（布局参考 cc-switch）：
 *   名称* + 备注 · 官网链接 · API Key*（本地加密） · API 请求地址*（完整 URL 开关 / 管理与测速）
 *   · 默认模型（获取模型列表 → 勾选启用）· 高级选项（上游格式 / 模型映射 / 思考 / UA / Headers）
 * 编辑正在使用的供应商时提示「保存后立即生效」。
 */
import {
  Badge,
  Button,
  FormField,
  Input,
  Notice,
  Select,
  Switch,
  Textarea,
  SkeletonList,
} from '@ig-live/ui';
import React, { useMemo, useState } from 'react';

import {
  LOCAL_ONLY_NOTICE,
  PROTOCOL_LABELS,
  endpointPreview,
  providerClient,
  type FetchModelsResult,
  type FetchedModel,
  type ModelMapping,
  type Protocol,
  type ProviderInput,
  type ProviderPreset,
  type ProviderView,
  type TestResult,
} from '../../services/providerClient';

import styles from './index.module.css';
import { KeyManager } from './KeyManager';
import { FetchBadge, Monogram, TestBadge, headersToText, parseHeaders } from './shared';

export type EditorTarget =
  { kind: 'new'; preset: ProviderPreset } | { kind: 'edit'; provider: ProviderView };

const PROTOCOL_HINT: Record<Protocol, string> = {
  'openai-chat': '填写兼容 OpenAI Chat Completions 的服务端点地址（会拼接 /chat/completions）',
  'openai-responses': '填写兼容 OpenAI Responses 格式的服务端点地址（会拼接 /responses）',
  anthropic: '填写兼容 Anthropic Messages 的服务端点地址（会拼接 /v1/messages）',
};

export const ProviderEditor: React.FC<{
  target: EditorTarget;
  isActive: boolean;
  onBack: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}> = ({ target, isActive, onBack, onSaved, onError }) => {
  const saved = target.kind === 'edit' ? target.provider : undefined;
  const preset = target.kind === 'new' ? target.preset : undefined;
  const [name, setName] = useState(
    saved?.name ?? (preset?.id === 'custom' ? '' : (preset?.name ?? '')),
  );
  const [note, setNote] = useState(saved?.note ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(saved?.websiteUrl ?? preset?.websiteUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseURL, setBaseURL] = useState(saved?.baseURL ?? preset?.baseURL ?? '');
  const [fullUrl, setFullUrl] = useState(saved?.fullUrl ?? false);
  const [protocol, setProtocol] = useState<Protocol>(
    saved?.protocol ?? preset?.protocol ?? 'openai-chat',
  );
  const [defaultModel, setDefaultModel] = useState(
    saved?.defaultModel ?? preset?.defaultModel ?? '',
  );
  const [fetched, setFetched] = useState<FetchedModel[]>(
    saved?.fetchedModels ?? (preset?.models ?? []).map((id) => ({ id })),
  );
  const [enabled, setEnabled] = useState<Set<string>>(
    new Set(saved?.models ?? (preset?.defaultModel ? [preset.defaultModel] : [])),
  );
  const [modelFilter, setModelFilter] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [modelMap, setModelMap] = useState<ModelMapping[]>(saved?.modelMap ?? []);
  const [thinking, setThinking] = useState(Boolean(saved?.thinking));
  const [userAgent, setUserAgent] = useState(saved?.userAgent ?? '');
  const [headersText, setHeadersText] = useState(headersToText(saved?.headers));
  const [test, setTest] = useState<TestResult | 'pending'>();
  const [fetchRes, setFetchRes] = useState<FetchModelsResult | 'pending'>();
  const [busy, setBusy] = useState(false);

  const endpoint = endpointPreview(protocol, baseURL, fullUrl);
  const keyRequired = target.kind === 'new' && Boolean(preset?.requiresApiKey);
  const title = target.kind === 'edit' ? `编辑 ${saved!.name}` : `添加 ${preset!.name}`;

  const input = (): ProviderInput => ({
    ...(saved ? { id: saved.id } : { presetId: preset!.id }),
    name: name.trim() || preset?.name || '自定义',
    note,
    websiteUrl,
    protocol,
    baseURL,
    fullUrl,
    defaultModel: defaultModel.trim() || [...enabled][0] || modelMap[0]?.to || '',
    models: [...enabled],
    fetchedModels: fetched,
    modelMap: modelMap.filter((m) => m.from.trim() && m.to.trim()),
    thinking,
    userAgent,
    headers: parseHeaders(headersText),
    apiKey: apiKey.trim() || undefined,
  });

  const missing = !baseURL.trim() || (keyRequired && !apiKey.trim());

  const save = async (activate: boolean) => {
    setBusy(true);
    try {
      const view = await providerClient.upsert(input());
      if (activate) await providerClient.setActive(view.id);
      setApiKey('');
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const fetchModels = async () => {
    setFetchRes('pending');
    try {
      const r = await providerClient.fetchModelsDraft(input());
      setFetchRes(r);
      if (r.ok) {
        setFetched(r.models);
        if (!defaultModel.trim() && r.models[0]) setDefaultModel(r.models[0].id);
      }
    } catch (e) {
      setFetchRes(undefined);
      onError(e);
    }
  };

  const toggle = (id: string) =>
    setEnabled((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const visible = useMemo(
    () =>
      fetched.filter((m) => !modelFilter || m.id.toLowerCase().includes(modelFilter.toLowerCase())),
    [fetched, modelFilter],
  );

  return (
    <div className={styles.editor} data-testid="provider-editor">
      <div className={styles.editorHead}>
        <button
          type="button"
          className={styles.back}
          onClick={onBack}
          aria-label="返回"
          data-testid="editor-back"
        >
          ‹
        </button>
        <h3>{title}</h3>
        <span className="cd-muted">{PROTOCOL_LABELS[protocol]}</span>
      </div>

      <div className={styles.editorBody}>
        {isActive && (
          <Notice data-testid="active-edit-notice">
            ⓘ 这是正在使用的供应商。保存后立即生效，下一次请求就用新的设置。
          </Notice>
        )}

        <div className={styles.form}>
          <FormField
            label={
              <>
                名称 <span className={styles.req}>*</span>
              </>
            }
          >
            {({ id }) => (
              <div className={styles.inline}>
                <Monogram name={name || preset?.name || '?'} brand={preset?.id} size={36} />
                <Input
                  id={id}
                  data-testid="draft-name"
                  value={name}
                  placeholder="例如：我的网关"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
          </FormField>
          <FormField label="备注">
            <Input
              data-testid="draft-note"
              value={note}
              placeholder="可选"
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          <FormField
            label="官网链接"
            className={styles.full}
            hint={
              preset?.docsUrl ? (
                <span data-testid="preset-docs">
                  官方 API 文档：<span className="cd-code">{preset.docsUrl}</span>
                  {preset.verified && ' · 预设已按文档核对（2026-10-11）'}
                </span>
              ) : undefined
            }
          >
            <Input
              data-testid="draft-website"
              value={websiteUrl}
              placeholder="https://"
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </FormField>

          <FormField
            label={<>API Key {keyRequired && <span className={styles.req}>*</span>}</>}
            className={styles.full}
            hint={
              <span data-testid="local-only-notice">
                🔒 {LOCAL_ONLY_NOTICE}
                {preset?.apiKeyUrl && (
                  <>
                    {' '}
                    · 获取：<span className="cd-code">{preset.apiKeyUrl}</span>
                  </>
                )}
              </span>
            }
          >
            {({ id }) => (
              <div className={styles.inline}>
                <Input
                  id={id}
                  data-testid="draft-key"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={apiKey}
                  placeholder={
                    saved?.keys[0]
                      ? `已保存 ${saved.keys[0].masked}（留空则不修改；填写将设为主 Token）`
                      : preset?.requiresApiKey
                        ? '粘贴 Token'
                        : '可留空（本地服务）'
                  }
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowKey(!showKey)}
                  aria-label="显示 / 隐藏"
                >
                  {showKey ? '🙈' : '👁'}
                </Button>
              </div>
            )}
          </FormField>

          <FormField
            className={styles.full}
            label={
              <span className={styles.labelRow}>
                <span>
                  API 请求地址 <span className={styles.req}>*</span>
                </span>
                <span className={styles.pill}>
                  🔗 完整 URL
                  <Switch
                    data-testid="draft-fullurl"
                    checked={fullUrl}
                    onChange={setFullUrl}
                    aria-label="完整 URL"
                  />
                </span>
                <span className="cd-spacer" />
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="draft-test"
                  onClick={() => {
                    setTest('pending');
                    providerClient
                      .testDraft(input())
                      .then(setTest)
                      .catch((e) => {
                        setTest(undefined);
                        onError(e);
                      });
                  }}
                >
                  ⚡ 管理与测速
                </Button>
                <TestBadge r={test} />
              </span>
            }
            hint={
              <>
                {fullUrl ? '完整 URL：按原样请求，不再拼接路径' : PROTOCOL_HINT[protocol]}
                {endpoint && (
                  <div>
                    实际请求：
                    <code className="cd-code" data-testid="endpoint-preview">
                      POST {endpoint}
                    </code>
                  </div>
                )}
              </>
            }
          >
            <Input
              data-testid="draft-baseurl"
              value={baseURL}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setBaseURL(e.target.value)}
            />
          </FormField>

          <FormField
            className={styles.full}
            label="默认模型"
            hint="对话默认请求的模型，随时可改；聊天窗口的模型选择器列出下方勾选的模型。留空且配置了模型映射时，默认使用映射第一行。"
          >
            {({ id }) => (
              <div className={styles.inline}>
                <Input
                  id={id}
                  data-testid="draft-model"
                  list="pp-models"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                />
                <datalist id="pp-models">
                  {fetched.map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
                </datalist>
                <Button
                  size="sm"
                  data-testid="fetch-models"
                  title="从上游获取模型列表"
                  onClick={() => void fetchModels()}
                >
                  ⤓ 获取模型
                </Button>
              </div>
            )}
          </FormField>

          <div className={styles.full}>
            <div className={styles.inline}>
              <FetchBadge r={fetchRes} />
              {fetched.length > 0 && (
                <>
                  <span className="cd-muted">
                    已启用 {enabled.size} / {fetched.length}
                  </span>
                  <span className="cd-spacer" />
                  <Input
                    size="sm"
                    placeholder="筛选模型"
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    style={{ maxWidth: 180 }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEnabled(new Set(fetched.map((m) => m.id)))}
                  >
                    全选
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEnabled(new Set(defaultModel ? [defaultModel] : []))}
                  >
                    清空
                  </Button>
                </>
              )}
            </div>
            {fetchRes === 'pending' && fetched.length === 0 && (
              <SkeletonList rows={4} className={styles.modelSkeleton} />
            )}
            {fetched.length > 0 && (
              <div className={styles.modelList} data-testid="model-list">
                {visible.map((m) => (
                  <label key={m.id} className={styles.modelRow} data-testid={`model-row-${m.id}`}>
                    <input
                      type="checkbox"
                      checked={enabled.has(m.id)}
                      onChange={() => toggle(m.id)}
                    />
                    <span className={styles.modelId}>{m.id}</span>
                    {m.name && <span className="cd-muted">{m.name}</span>}
                    <span className="cd-spacer" />
                    {defaultModel === m.id ? (
                      <Badge>默认</Badge>
                    ) : (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        data-testid={`model-default-${m.id}`}
                        onClick={() => {
                          setDefaultModel(m.id);
                          setEnabled((s) => new Set(s).add(m.id));
                        }}
                      >
                        设为默认
                      </button>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={`${styles.full} ${styles.advanced}`}>
            <button
              type="button"
              className={styles.advHead}
              data-testid="advanced-toggle"
              onClick={() => setAdvanced(!advanced)}
              aria-expanded={advanced}
            >
              <span>{advanced ? '⌄' : '›'} 高级选项</span>
              <span className="cd-muted">
                包含上游格式、模型映射、思考能力、自定义 User-Agent 与 Headers。
              </span>
            </button>
            {advanced && (
              <div className={styles.form}>
                <FormField label="上游格式" className={styles.full}>
                  <Select
                    data-testid="draft-protocol"
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as Protocol)}
                    options={(Object.keys(PROTOCOL_LABELS) as Protocol[]).map((p) => ({
                      value: p,
                      label: PROTOCOL_LABELS[p],
                    }))}
                  />
                </FormField>
                <FormField
                  label="模型映射（请求模型 → 上游模型，* 匹配任意）"
                  className={styles.full}
                >
                  {() => (
                    <div className={styles.mapList} data-testid="model-map">
                      {modelMap.map((m, i) => (
                        <div key={i} className={styles.inline}>
                          <Input
                            size="sm"
                            placeholder="请求模型"
                            value={m.from}
                            onChange={(e) =>
                              setModelMap(
                                modelMap.map((x, j) =>
                                  j === i ? { ...x, from: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          <span>→</span>
                          <Input
                            size="sm"
                            placeholder="上游模型"
                            list="pp-models"
                            value={m.to}
                            onChange={(e) =>
                              setModelMap(
                                modelMap.map((x, j) =>
                                  j === i ? { ...x, to: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="删除映射"
                            onClick={() => setModelMap(modelMap.filter((_, j) => j !== i))}
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="map-add"
                        onClick={() => setModelMap([...modelMap, { from: '', to: '' }])}
                      >
                        ＋ 添加映射
                      </Button>
                    </div>
                  )}
                </FormField>
                <FormField
                  label="思考 / 推理"
                  hint="Anthropic：extended thinking；OpenAI：reasoning effort = medium"
                >
                  {() => (
                    <Switch
                      data-testid="draft-thinking"
                      checked={thinking}
                      onChange={setThinking}
                      label={thinking ? '开启' : '关闭'}
                    />
                  )}
                </FormField>
                <FormField label="User-Agent（可选）">
                  <Input
                    data-testid="draft-ua"
                    value={userAgent}
                    placeholder="默认"
                    onChange={(e) => setUserAgent(e.target.value)}
                  />
                </FormField>
                <FormField
                  label="自定义 Headers（每行 Name: value 或 JSON）"
                  className={styles.full}
                >
                  <Textarea
                    data-testid="draft-headers"
                    rows={2}
                    value={headersText}
                    onChange={(e) => setHeadersText(e.target.value)}
                  />
                </FormField>
                {saved && (
                  <div className={styles.full}>
                    <h4 className={styles.catTitle}>Token 管理（多 Token 自动故障切换）</h4>
                    <KeyManager p={saved} onError={onError} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.editorFoot}>
        <Button onClick={onBack}>取消</Button>
        {target.kind === 'new' && (
          <Button
            data-testid="draft-save"
            disabled={busy || missing}
            onClick={() => void save(false)}
          >
            保存
          </Button>
        )}
        <Button
          variant="primary"
          data-testid={target.kind === 'new' ? 'draft-save-activate' : 'draft-save'}
          disabled={busy || missing}
          onClick={() => void save(target.kind === 'new')}
        >
          {target.kind === 'new' ? '保存并设为当前' : '保存'}
        </Button>
      </div>
    </div>
  );
};
