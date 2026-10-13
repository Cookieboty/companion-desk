/* eslint-disable @typescript-eslint/no-require-imports, no-console -- 构建期 Node 脚本（CommonJS） */
/**
 * 扫描源码中的中文字符串字面量（跳过注释、日志、import）。
 * 用法：node scripts/i18n/scan.cjs [--json out.json] <dir...>
 */
const ts = require(require.resolve('typescript', { paths: [process.cwd(), __dirname + '/../..'] }));
const fs = require('fs');
const path = require('path');
const han = /[\u4e00-\u9fff]/;
const LOG =
  /(^|\.)(console|logger|log|debug|trace)(\?)?\.|(^|\.)(debug|info|warn|error|trace|verbose|log)$/i;

function isLogCall(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const e = p.expression.getText().replace(/\?\./g, '.');
      if (LOG.test(e) || /logger/i.test(e)) return true;
    }
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isCallExpression(p) && /^(t|tt|i18n\.t)$/.test(p.expression.getText())) return false;
  }
  return false;
}

function collect(file, out) {
  const text = fs.readFileSync(file, 'utf8');
  const src = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  (function v(n) {
    const isStr = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
    if (
      (isStr || ts.isTemplateExpression(n) || ts.isJsxText(n)) &&
      han.test(n.getText()) &&
      !isLogCall(n)
    ) {
      out.push({ file, pos: n.getStart(), kind: ts.SyntaxKind[n.kind], text: n.getText() });
      return;
    }
    ts.forEachChild(n, v);
  })(src);
}

function walk(d, files) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (!/^(node_modules|dist|__tests__|locales)$/.test(f)) walk(p, files);
    } else if (/\.(ts|tsx)$/.test(f) && !/\.(test|spec|d)\.tsx?$/.test(f)) files.push(p);
  }
}

module.exports = { collect, walk };
if (require.main === module) {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json');
  const outFile = ji >= 0 ? args.splice(ji, 2)[1] : null;
  const files = [];
  args.forEach((d) => walk(d, files));
  const out = [];
  files.forEach((f) => collect(f, out));
  const by = {};
  out.forEach((o) => (by[o.file.split('/')[1] ?? o.file] = (by[o.file.split('/')[1]] ?? 0) + 1));
  console.log(out.length, 'literals;', new Set(out.map((o) => o.text)).size, 'unique', by);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
}
