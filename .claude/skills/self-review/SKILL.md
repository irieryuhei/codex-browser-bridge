---
name: self-review
description: タスク完了前に差分を見直し、回帰・抜け漏れ・未検証点を洗い出す
disable-model-invocation: true
allowed-tools: Bash(git:*), Bash(npm:*), Bash(npx:*), Read, Glob, Grep
---

# Self Review

## Use when

- 大きめの変更をまとめる前
- ユーザーに完了報告する前
- バグ修正や仕様変更で、回帰が不安なとき

## Workflow

### 1. 差分確認

```bash
git diff --name-only HEAD
git diff --stat HEAD
git diff HEAD
```

### 2. 影響範囲の確認

- 変更ファイルごとに、呼び出し元・関連テスト・README を確認する
- UI変更なら `test/viewer-html.test.ts`
- bridge変更なら `test/bridge-server.test.ts`
- Codex連携変更なら `test/codex-process.test.ts`

### 3. 検証

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
```

### 4. 判定

- PASS: 問題なし
- MINOR: 軽微な懸念のみ
- FAIL: バグ、仕様逸脱、未検証の重大リスクあり

## Review focus

- 既存仕様とのズレ
- session 状態遷移の破綻
- browser UI と bridge payload の不整合
- 永続化データとの互換性
- README や要件資料の更新漏れ

## Output

- Findings を重要度順に並べる
- 問題がなければ、その旨と未検証点だけを短く残す
