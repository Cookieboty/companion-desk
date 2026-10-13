/* eslint-disable @typescript-eslint/no-require-imports, no-console -- 构建期 Node 脚本（CommonJS） */
/**
 * 一次性 codemod（第二遍）：模块顶层常量里的中文标签在渲染处晚翻译。
 * 把 JSX 中直接渲染的 `{x.label}` / `title={x.desc}` 等包成 `{t(x.label)}`。
 * t() 对不在词典中的字符串原样返回，所以多包一层是安全的。
 */
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
const fs = require('fs');

const cfg = require('./config.cjs');
const { walk } = require('./scan.cjs');
const PROPS = new Set([
  'label',
  'name',
  'desc',
  'title',
  'hint',
  'text',
  'description',
  'placeholder',
  'tip',
  'summary',
  'subtitle',
  'caption',
  'short',
  'zh',
]);
let n = 0;
for (const pkg of cfg.packages) {
  if (pkg.dir.includes('electron')) continue;
  const files = [];
  walk(pkg.dir, files);
  for (const file of files.filter((f) => f.endsWith('.tsx'))) {
    if (cfg.keepZh.some((re) => re.test(file))) continue;
    let text = fs.readFileSync(file, 'utf8');
    const m = /import \{[^}]*\bt(?: as (tr))?\b[^}]*\} from '[^']*(ui|i18n)'/.exec(text);
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits = [];
    (function v(node) {
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        ts.isPropertyAccessExpression(node.expression) &&
        PROPS.has(node.expression.name.text)
      ) {
        const p = node.parent;
        if (ts.isJsxElement(p) || ts.isJsxFragment(p) || ts.isJsxAttribute(p)) {
          if (!(
            ts.isJsxAttribute(p) &&
            /^(key|className|style|id|data-|href|src)/.test(p.name.getText())
          ))
            edits.push(node.expression);
        }
      }
      ts.forEachChild(node, v);
    })(src);
    if (!edits.length) continue;
    const fn = m
      ? m[1] || 't'
      : /\bt\b\s*[,)=]/.test(text) && /\((t)\)|\bt =>|const t\b/.test(text)
        ? 'tr'
        : 't';
    edits.sort((a, b) => b.getStart() - a.getStart());
    for (const e of edits)
      text = text.slice(0, e.getStart()) + `${fn}(${e.getText()})` + text.slice(e.getEnd());
    if (!m) {
      const first = src.statements.find((s) => ts.isImportDeclaration(s));
      const from = pkg.dir.endsWith('ui/src')
        ? require('path')
            .relative(require('path').dirname(file), pkg.dir + '/i18n')
            .replace(/^(?!\.)/, './')
        : '@ig-live/ui';
      const imp = `import { ${fn === 't' ? 't' : 't as tr'} } from '${from}';\n`;
      const at = first ? first.getStart() : 0;
      text = text.slice(0, at) + imp + text.slice(at);
    }
    fs.writeFileSync(file, text);
    n += edits.length;
    console.log(file.replace(/^.*packages\//, ''), edits.length);
  }
}
console.log('wrapped', n);
