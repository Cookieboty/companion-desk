/* eslint-disable @typescript-eslint/no-require-imports, no-console -- 构建期 Node 脚本（CommonJS） */
/**
 * CI 检查：源码里每个面向用户的中文字符串（t() 的 key、以及其余中文字面量）都必须在对应 en.json 中有英文。
 * 故意保留中文的文件见 config.cjs keepZh；单行豁免写 `// i18n-ignore`。
 * 用法：node scripts/i18n/check.cjs [--missing out.json]   缺失时退出码 1
 */
const ts = require(require.resolve('typescript', { paths: [process.cwd(), __dirname + '/../..'] }));
const fs = require('fs');
const path = require('path');

const cfg = require('./config.cjs');
const { walk } = require('./scan.cjs');

const root = path.resolve(__dirname, '../..');
const han = /[\u4e00-\u9fff]/;
const LOG =
  /(^|\.)(console|logger|log|debug|trace)\.|(^|\.)(debug|info|warn|error|trace|verbose|log)$/i;

function keysOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const src = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  const ignored = (n) => {
    const l = src.getLineAndCharacterOfPosition(n.getStart()).line;
    return /i18n-ignore/.test(lines[l] || '') || /i18n-ignore/.test(lines[l - 1] || '');
  };
  const isLog = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p))
        return true;
      if (ts.isCallExpression(p)) {
        const e = p.expression.getText().replace(/\?\./g, '.');
        if (LOG.test(e) || /logger/i.test(e)) return true;
      }
    }
    return false;
  };
  (function v(n) {
    const isStr = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
    if ((isStr || ts.isTemplateExpression(n) || ts.isJsxText(n)) && han.test(n.getText())) {
      if (isLog(n) || ignored(n)) return;
      let key;
      if (isStr) key = n.text;
      else if (ts.isJsxText(n))
        key = n
          .getText()
          .trim()
          .replace(/\s*\n\s*/g, ' ');
      else {
        key = n.head.text;
        n.templateSpans.forEach((s, i) => (key += `{${i}}` + s.literal.text));
      }
      const { line } = src.getLineAndCharacterOfPosition(n.getStart());
      out.push({ key, where: `${path.relative(root, file)}:${line + 1}` });
      return;
    }
    ts.forEachChild(n, v);
  })(src);
  return out;
}

const missing = {};
let count = 0;
for (const pkg of cfg.packages) {
  const dict = JSON.parse(fs.readFileSync(path.join(root, pkg.dict), 'utf8'));
  const files = [];
  walk(path.join(root, pkg.dir), files);
  for (const f of files) {
    if (cfg.keepZh.some((re) => re.test(f.replace(/\\/g, '/')))) continue;
    for (const { key, where } of keysOf(f)) {
      count++;
      if (dict[key] === undefined) (missing[pkg.dict] ||= {})[key] ||= where;
    }
  }
}
const n = Object.values(missing).reduce((a, m) => a + Object.keys(m).length, 0);
const i = process.argv.indexOf('--missing');
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(missing, null, 1));
if (n) {
  for (const [dict, m] of Object.entries(missing)) {
    console.error(`\n${dict}: ${Object.keys(m).length} missing English translations`);
    for (const [k, w] of Object.entries(m).slice(0, 50))
      console.error(`  ${w}  ${JSON.stringify(k)}`);
  }
  process.exit(1);
}
console.log(`i18n: ${count} strings checked, all have English translations`);
