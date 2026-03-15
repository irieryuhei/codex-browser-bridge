# RD-002 システム要件

## 文書管理

- Scope ID: `f0001-browser-codex-bridge`
- Status: ACTIVE
- Updated: 2026-03-15

## システム構成

システムは 3 つの要素で構成する。

1. ブラウザ UI
2. Bridge Server
3. `codex app-server`

これらは Podman コンテナ内の Bridge / Codex と、コンテナへ接続するブラウザ UI の組み合わせとして動作する。

## 目標アーキテクチャ

```text
ブラウザ UI
  -> WebSocket
Bridge Server
  -> stdio
codex app-server (full access)
```

## コンポーネント責務

### ブラウザ UI

- Bridge URL の入力と接続
- project path の指定
- セッション開始
- メッセージ送信
- streaming 応答表示
- error / status 表示

### Bridge Server

- ブラウザとの WebSocket 通信
- Codex プロセス生成とライフサイクル管理
- ブラウザのメッセージを Codex RPC へ変換
- Codex の出力をブラウザ表示用イベントへ変換

### Codex Process Runner

- Codex をフル権限で起動
- app-server RPC 初期化
- turn 開始
- streaming イベント受信

## システム要件一覧

- `SR-001 WebSocket endpoint`
  - Bridge Server はブラウザ UI が接続できる WebSocket endpoint を提供すること。

- `SR-002 Health endpoint`
  - Bridge Server は稼働確認用の `GET /health` endpoint を提供すること。

- `SR-003 セッション開始プロトコル`
  - ブラウザ UI は `projectPath` を含む session start request を Bridge へ送信できること。

- `SR-004 入力プロトコル`
  - ブラウザ UI はアクティブ session に対して text input を送信できること。

- `SR-005 出力プロトコル`
  - Bridge は Codex 出力を少なくとも `status`、`stream_delta`、`thinking_delta`、`assistant`、`result`、`error` としてブラウザへ中継できること。

- `SR-006 フルアクセス Codex 起動`
  - Bridge は Codex を sandbox / approval 無効化状態で起動すること。

- `SR-007 固定起動ポリシー`
  - Full access は設定項目ではなく既定挙動とし、MVP では sandbox 切替機能を持たないこと。

- `SR-008 provider 抽象なし`
  - Bridge 内部の session 実装は Codex 専用とし、Claude provider 抽象を持たないこと。

- `SR-009 worktree ロジックなし`
  - project path はそのまま作業ディレクトリとして扱い、worktree 検出・正規化・resume 解決を実装しないこと。

- `SR-010 最小 state 管理`
  - MVP では Browser 接続中の現在会話だけを扱い、recent sessions index、history restore、bridge restart 後の session persistence を持たないこと。

- `SR-011 セキュリティゲートなし`
  - MVP では allowed directory 制限、API key 認証、permission approval UI を実装しないこと。

- `SR-012 補助機能なし`
  - gallery、push、screenshot、diff、recording、debug bundle などの補助機能は実装対象外とすること。

## 最小 Browser-Bridge メッセージセット

### ブラウザ -> Bridge

- `start`
  - project path を指定して Codex セッションを開始する。
- `input`
  - 現在のセッションへテキストを送る。
- `interrupt`
  - 必要な場合のみ、進行中 turn を中断する。

### Bridge -> ブラウザ

- `system`
  - session 作成完了を通知する。
- `status`
  - `starting` / `running` / `idle` などの状態を通知する。
- `thinking_delta`
  - 思考中のストリームを通知する。
- `stream_delta`
  - 回答本文のストリームを通知する。
- `assistant`
  - まとまった assistant message を通知する。
- `result`
  - turn の成功・失敗・終了結果を通知する。
- `error`
  - bridge または Codex 側のエラーを通知する。

## 運用上の制約

- Podman コンテナ内に `codex` CLI がインストール済みであること。
- Bridge から `codex` コマンドへ直接アクセスできること。
- ブラウザから Bridge へネットワーク到達できること。

## 実装方針

- 旧 `ccpocket` から引き継ぐべき中心思想は「browser-first bridge」のみとする。
- 旧 repo に存在する複雑な周辺機能は持ち込まず、Bridge Server と Browser UI の 2 層に集中する。
- Codex 起動ポリシーは `full access fixed` を前提とし、設定可能性より単純性を優先する。
