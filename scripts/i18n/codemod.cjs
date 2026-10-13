/* eslint-disable @typescript-eslint/no-require-imports, no-console -- 构建期 Node 脚本（CommonJS） */
/**
 * 一次性 codemod：把函数体内的中文字符串字面量 / JSX 文本包成 t('原文')。
 * 模块顶层常量不改（在渲染处 t(label) 晚翻译），比较 / 解析用途的字符串不改。
 * 用法：node scripts/i18n/codemod.cjs [--dry]
 */
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
const fs = require('fs');
const path = require('path');

const cfg = require('./config.cjs');
const { walk } = require('./scan.cjs');

const han = /[\u4e00-\u9fff]/;
const LOG =
  /(^|\.)(console|logger|log|debug|trace)\.|(^|\.)(debug|info|warn|error|trace|verbose|log)$/i;
const DATA_METHODS = new Set([
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'lastIndexOf',
  'split',
  'replace',
  'replaceAll',
  'match',
  'matchAll',
  'test',
  'has',
  'get',
  'set',
  'delete',
  'localeCompare',
  'search',
  'exec',
  'getItem',
  'setItem',
  'removeItem',
  'querySelector',
  'querySelectorAll',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'invoke',
  'on',
  'off',
  'send',
  'handle',
]);
const DATA_KEYS = new Set([
  'id',
  'key',
  'type',
  'kind',
  'role',
  'value',
  'channel',
  'name_en',
  'code',
  'source',
  'match',
  'pattern',
  'keywords',
  'aliases',
  'triggers',
  'phrase',
]);
const dry = process.argv.includes('--dry');

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const unq = (n) => n.text; // StringLiteral / NoSubstitutionTemplate 的值

function inFunction(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p) || ts.isClassStaticBlockDeclaration?.(p)) return true;
    if (
      ts.isPropertyDeclaration(p) &&
      !p.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
    )
      return true;
  }
  return false;
}

function skip(n) {
  const p = n.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p))
    return true;
  if (ts.isLiteralTypeNode(p) || ts.isEnumMember(p) || ts.isCaseClause(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === n) return true;
  if (ts.isPropertyAssignment(p) && DATA_KEYS.has(p.name.getText().replace(/['"]/g, '')))
    return true;
  if (ts.isElementAccessExpression(p)) return true;
  if (
    ts.isBinaryExpression(p) &&
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.InKeyword,
    ].includes(p.operatorToken.kind)
  )
    return true;
  if (ts.isTaggedTemplateExpression(p)) return true;
  if (ts.isNewExpression(p) && /RegExp/.test(p.expression.getText())) return true;
  if (ts.isCallExpression(p)) {
    const e = p.expression;
    const name = ts.isPropertyAccessExpression(e) ? e.name.text : e.getText();
    if (/^(t|tr)$/.test(e.getText())) return true;
    if (DATA_METHODS.has(name)) return true;
  }
  if (ts.isArrayLiteralExpression(p)) {
    // ['开', '关'].includes(x) 之类
    const gp = p.parent;
    if (gp && ts.isPropertyAccessExpression(gp) && DATA_METHODS.has(gp.name.text)) return true;
    if (gp && ts.isPropertyAssignment(gp) && DATA_KEYS.has(gp.name.getText().replace(/['"]/g, '')))
      return true;
  }
  for (let q = p; q; q = q.parent) {
    if (ts.isCallExpression(q)) {
      const e = q.expression.getText().replace(/\?\./g, '.');
      if (LOG.test(e) || /logger/i.test(e)) return true;
    }
  }
  return false;
}

function usesIdent(src, name) {
  let found = false;
  (function v(n) {
    if (found) return;
    if (
      (ts.isParameter(n) ||
        ts.isVariableDeclaration(n) ||
        ts.isBindingElement(n) ||
        ts.isFunctionDeclaration(n)) &&
      n.name &&
      n.name.getText() === name
    )
      found = true;
    ts.forEachChild(n, v);
  })(src);
  return found;
}

let changedFiles = 0;
let total = 0;
for (const pkg of cfg.packages) {
  const files = [];
  walk(pkg.dir, files);
  for (const file of files) {
    if (cfg.keepZh.some((re) => re.test(file))) continue;
    let text = fs.readFileSync(file, 'utf8');
    const src = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const existing = /import \{[^}]*\bt(?: as (tr))?\b[^}]*\} from '[^']*(ui|i18n)'/.exec(text);
    const fnName = existing ? existing[1] || 't' : usesIdent(src, 't') ? 'tr' : 't';
    const edits = [];
    (function v(n) {
      const isStr = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
      const isTpl = ts.isTemplateExpression(n);
      const isJsx = ts.isJsxText(n);
      if ((isStr || isTpl || isJsx) && han.test(n.getText())) {
        if (!inFunction(n) || skip(n)) return;
        if (isJsx) {
          const raw = n.getText();
          const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
          const body = m[2].replace(/\s*\n\s*/g, ' ');
          edits.push([n.getStart(), n.getEnd(), `${m[1]}{${fnName}(${quote(body)})}${m[3]}`]);
        } else if (isStr) {
          const call = `${fnName}(${quote(unq(n))})`;
          const inAttr = ts.isJsxAttribute(n.parent);
          edits.push([n.getStart(), n.getEnd(), inAttr ? `{${call}}` : call]);
        } else {
          let key = n.head.text;
          const args = [];
          n.templateSpans.forEach((s, i) => {
            args.push(s.expression.getText());
            key += `{${i}}` + s.literal.text;
          });
          edits.push([n.getStart(), n.getEnd(), `${fnName}(${quote(key)}, ${args.join(', ')})`]);
        }
        return;
      }
      ts.forEachChild(n, v);
    })(src);
    if (!edits.length) continue;
    edits.sort((a, b) => b[0] - a[0]);
    for (const [s, e, r] of edits) text = text.slice(0, s) + r + text.slice(e);
    let from = pkg.importFrom;
    if (from.startsWith('<rel>')) {
      from = path.relative(path.dirname(file), path.join(pkg.dir, 'i18n')).replace(/\\/g, '/');
      if (!from.startsWith('.')) from = './' + from;
    } else if (from.startsWith('./') && pkg.dir.endsWith('ui/src')) {
      from = path.relative(path.dirname(file), path.join(pkg.dir, 'i18n')).replace(/\\/g, '/');
      if (!from.startsWith('.')) from = './' + from;
    }
    if (!existing) {
      const spec = fnName === 't' ? 't' : 't as tr';
      const imp = `import { ${spec} } from '${from}';\n`;
      // 插到第一条 import 之前（之后由 eslint --fix / prettier 排序）；没有 import 则放文件头（跳过注释块）
      const firstImport = src.statements.find((s) => ts.isImportDeclaration(s));
      const at = firstImport ? firstImport.getStart() : 0;
      text = text.slice(0, at) + imp + text.slice(at);
    }
    total += edits.length;
    changedFiles++;
    if (!dry) fs.writeFileSync(file, text);
  }
}
console.log(`${dry ? '[dry] ' : ''}wrapped ${total} strings in ${changedFiles} files`);
