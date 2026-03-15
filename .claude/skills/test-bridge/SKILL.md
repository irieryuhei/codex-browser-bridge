---
name: test-bridge
description: codex-browser-bridge のテスト実行・型チェック・ビルド確認・テスト追加方針
disable-model-invocation: true
allowed-tools: Bash(npx:*), Bash(npm:*), Read, Glob, Grep
---

# codex-browser-bridge テスト

## Use when

- TypeScript 実装を変更したとき
- `test/*.test.ts` を追加・更新するとき
- 最低限の検証コマンドを迷わず回したいとき

## Workflow

### 1. テスト

```bash
npm test
```

特定ファイルだけ:

```bash
npx vitest run test/<file>.test.ts
```

ウォッチ:

```bash
npm run test:watch
```

### 2. 型チェック

```bash
npx tsc --noEmit -p tsconfig.json
```

### 3. ビルド

```bash
npm run build
```

## Test layout

- テストは `test/*.test.ts`
- 実装は `src/*.ts`
- UI は `src/viewer-html.ts`
- bridge は `src/bridge-server.ts`
- Codex app-server 接続は `src/codex-process.ts`

## Test writing guidance

- `describe` は対象モジュール単位
- `it` は英語で 1 振る舞いずつ書く
- import は `vitest` から行う
- TypeScript の import は `.js` 拡張子を使う
- 新機能は、まず失敗するテストを書いてから実装する

## Verification baseline

変更完了時は、原則として次を全て通す。

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
```
