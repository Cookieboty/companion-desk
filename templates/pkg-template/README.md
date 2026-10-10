# @ig-live/pkg-template

Workspace 包模板。**不要**直接改这里，用于给新包提供起手骨架。

## 使用方法

```bash
# 1. 拷贝
cp -r templates/pkg-template packages/<your-pkg>

# 2. 改名（package.json.name）
sed -i '' 's|@ig-live/pkg-template|@ig-live/<your-pkg>|g' packages/<your-pkg>/package.json packages/<your-pkg>/src/*.ts

# 3. 安装 + 冒烟
pnpm install
pnpm --filter @ig-live/<your-pkg> build test lint typecheck
```

## 结构

```
templates/pkg-template
├── package.json          # 复用 tsup + vitest；exports 双出（esm/cjs）
├── tsconfig.json         # extends 根 tsconfig.node.json
├── tsup.config.ts        # 复用根 tsup.base.ts
├── vitest.config.ts      # 复用根 vitest.base.ts
└── src
    ├── index.ts
    └── index.test.ts
```
