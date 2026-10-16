import { Badge, Button, Input, Notice, t } from '@nomi-ai/ui';
import { Info, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import {
  usageClient,
  type UsageCustomPrice,
  type UsageSettings,
  type UsageState,
  type UsageSummary,
} from '../../services/usageClient';
import { AppIcon } from '../AppIcons';

import { formatPrice } from './format';
import styles from './index.module.css';

interface Row {
  model: string;
  input: string;
  output: string;
  cacheRead: string;
  cacheWrite: string;
}

const toRow = (p: UsageCustomPrice): Row => ({
  model: p.model,
  input: String(p.input),
  output: String(p.output),
  cacheRead: p.cacheRead == null ? '' : String(p.cacheRead),
  cacheWrite: p.cacheWrite == null ? '' : String(p.cacheWrite),
});

const num = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
};

/** 表单行 → 价格；不合法返回错误信息 */
export function parseRows(rows: Row[]): { prices: UsageCustomPrice[] } | { error: string } {
  const out: UsageCustomPrice[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const model = r.model.trim();
    if (!model) return { error: t('模型名不能为空') };
    const key = model.toLowerCase();
    if (seen.has(key)) return { error: t('模型「{0}」重复了', model) };
    seen.add(key);
    const input = num(r.input);
    const output = num(r.output);
    const cr = num(r.cacheRead);
    const cw = num(r.cacheWrite);
    if (input == null || output == null || [input, output, cr, cw].some((n) => Number.isNaN(n)))
      return { error: t('「{0}」的价格需要是不小于 0 的数字（输入、输出价必填）', model) };
    out.push({
      model,
      input,
      output,
      ...(cr != null ? { cacheRead: cr } : {}),
      ...(cw != null ? { cacheWrite: cw } : {}),
    });
  }
  return { prices: out };
}

interface Props {
  state: UsageState;
  unpriced: UsageSummary['unpriced'];
  onSettings: (s: UsageSettings) => void;
}

export const Pricing: React.FC<Props> = ({ state, unpriced, onSettings }) => {
  const st = state.settings;
  const [rows, setRows] = useState<Row[]>(() => st.customPrices.map(toRow));
  const [rate, setRate] = useState(String(st.cnyPerUsd));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // 外部设置变化（保存 / 另一个窗口修改）时同步表单：渲染期比较，避免 effect 里 setState
  const [seen, setSeen] = useState({ prices: st.customPrices, rate: st.cnyPerUsd });
  if (seen.prices !== st.customPrices || seen.rate !== st.cnyPerUsd) {
    setSeen({ prices: st.customPrices, rate: st.cnyPerUsd });
    setRows(st.customPrices.map(toRow));
    setRate(String(st.cnyPerUsd));
  }

  const patch = async (p: Partial<UsageSettings>) => {
    try {
      onSettings(await usageClient.setSettings(p));
      setErr(null);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const update = (i: number, k: keyof Row, v: string) => {
    setSaved(false);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  };
  const add = (model = '') => {
    setSaved(false);
    setRows((rs) => [...rs, { model, input: '', output: '', cacheRead: '', cacheWrite: '' }]);
  };
  const save = async () => {
    const r = parseRows(rows);
    if ('error' in r) return setErr(r.error);
    if (await patch({ customPrices: r.prices })) setSaved(true);
  };
  const saveRate = async () => {
    const n = Number(rate);
    if (!(n > 0 && n < 1000)) return setErr(t('汇率需要是大于 0 的数字'));
    await patch({ cnyPerUsd: n });
  };
  const custom = new Set(st.customPrices.map((p) => p.model.toLowerCase()));
  const todo = unpriced.filter(
    (u) => !rows.some((r) => r.model.trim().toLowerCase() === u.model.toLowerCase()),
  );

  return (
    <div className={styles.stack} data-testid="usage-pricing">
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h3>{t('币种与汇率')}</h3>
        </header>
        <div className={styles.fxRow}>
          <label className={styles.rate}>
            <span>1 USD =</span>
            <Input
              size="sm"
              type="number"
              step="any"
              min="0"
              value={rate}
              data-testid="usage-rate"
              aria-label={t('美元兑人民币汇率')}
              onChange={(e) => setRate(e.target.value)}
              onBlur={() => void saveRate()}
            />
            <span>CNY</span>
            <Badge tone="neutral">{t('可自定义')}</Badge>
          </label>
        </div>
        <p className={styles.dim}>
          {t(
            '费用统一按 USD 计价，再按这里的汇率折算。默认汇率只是占位值，不是实时汇率，请按需修改。',
          )}
        </p>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h3>{t('自定义价格')}</h3>
          <span className={styles.dim}>{t('USD / 百万 Token')}</span>
        </header>
        <p className={styles.dim}>
          {t(
            '用来添加内置价格表没有的模型，或覆盖内置价格。缓存价留空时按输入价计算；0 是合法价格（免费模型）。支持用前缀匹配带日期后缀的模型名。',
          )}
        </p>
        {todo.length > 0 && (
          <Notice tone="warning" icon={Info} data-testid="usage-todo-prices">
            {t('这些模型出现过但没有价格：')}
            {todo.slice(0, 8).map((u) => (
              <button
                key={u.model}
                type="button"
                className={styles.chip}
                onClick={() => add(u.model)}
              >
                <AppIcon icon={Plus} size={12} />
                {u.model}
              </button>
            ))}
          </Notice>
        )}
        {rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="usage-custom-table">
              <thead>
                <tr>
                  <th>{t('模型')}</th>
                  <th className={styles.num}>{t('输入')}</th>
                  <th className={styles.num}>{t('输出')}</th>
                  <th className={styles.num}>{t('缓存读')}</th>
                  <th className={styles.num}>{t('缓存写')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} data-testid="usage-custom-row">
                    <td>
                      <Input
                        size="sm"
                        value={r.model}
                        placeholder="model-name"
                        aria-label={t('模型名')}
                        onChange={(e) => update(i, 'model', e.target.value)}
                      />
                    </td>
                    {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((k) => (
                      <td key={k} className={styles.num}>
                        <Input
                          size="sm"
                          type="number"
                          step="any"
                          min="0"
                          className={styles.priceIn}
                          value={r[k]}
                          aria-label={[r.model || t('模型'), k].join(' ')}
                          data-testid={`usage-price-${k}`}
                          onChange={(e) => update(i, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('删除这一行')}
                        onClick={() => {
                          setSaved(false);
                          setRows((rs) => rs.filter((_, j) => j !== i));
                        }}
                      >
                        <AppIcon icon={Trash2} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.actionsRow}>
          <Button size="sm" onClick={() => add()} data-testid="usage-add-price">
            <AppIcon icon={Plus} />
            {t('添加模型价格')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void save()}
            data-testid="usage-save-prices"
          >
            {t('保存价格')}
          </Button>
          {saved && <span className={styles.ok}>{t('已保存')}</span>}
        </div>
        {err && <p className={styles.err}>{err}</p>}
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h3>{t('内置价格表')}</h3>
          <span className={styles.dim}>
            {t('整理于 {0}，依据官方公开价目，非实时', state.pricing.date)}
          </span>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="usage-builtin-table">
            <thead>
              <tr>
                <th>{t('模型')}</th>
                <th className={styles.num}>{t('输入')}</th>
                <th className={styles.num}>{t('输出')}</th>
                <th className={styles.num}>{t('缓存读')}</th>
                <th className={styles.num}>{t('缓存写')}</th>
                <th>{t('备注')}</th>
              </tr>
            </thead>
            <tbody>
              {state.pricing.builtin.map((p) => (
                <tr key={p.model}>
                  <td className={styles.mono}>
                    {p.label ?? p.model}
                    {custom.has(p.model.toLowerCase()) && (
                      <Badge tone="accent" className={styles.estBadge}>
                        {t('已覆盖')}
                      </Badge>
                    )}
                  </td>
                  <td className={styles.num}>{formatPrice(p.input)}</td>
                  <td className={styles.num}>{formatPrice(p.output)}</td>
                  <td className={styles.num}>{formatPrice(p.cacheRead)}</td>
                  <td className={styles.num}>{formatPrice(p.cacheWrite)}</td>
                  <td className={styles.dim}>{p.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.dim}>
          {t('不在表里、又没有自定义价格的模型会显示「未定价」，不计入费用合计，也不会被猜价。')}
        </p>
      </section>
    </div>
  );
};
