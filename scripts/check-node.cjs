// preinstall：Node 版本过低时给出清楚的提示（CommonJS + ES5 语法，老版本 Node 也能运行到这里）
var v = process.versions.node.split('.').map(Number);
if (v[0] < 22 || (v[0] === 22 && v[1] < 12)) {
  console.error(
    '\n  ✖ Companion Desk needs Node >= 22.12 (you have ' +
      process.versions.node +
      ').\n' +
      '    Install Node 22 LTS or newer (nvm install  — reads .nvmrc — or brew install node@22),\n' +
      '    then run: rm -rf node_modules && pnpm install\n',
  );
  process.exit(1);
}
