# DES-001 ユーザー要件

## 文書管理

- Scope ID: `f0001-browser-codex-bridge`
- Feature Name: Browser Codex Bridge
- Status: FIXED
- Updated: 2026-03-15
- Source: User request on 2026-03-15

## 目的

新しいリポジトリは、Podman コンテナ内で稼働する Codex をブラウザから操作するための最小構成ツールとして実装する。

利用者が達成したい結果は次の 2 点に限定する。

1. ブラウザから Codex を呼び出せること。
2. Codex が sandbox や承認待ちなしで制限なく活動できること。

## 背景

- 新リポジトリは既存 `ccpocket` の完全複製ではなく、目的を絞った別名リポジトリとして新規作成する。
- 実行環境は常に Podman コンテナ内であり、Codex にホスト保護のための sandbox を課す必要がない。
- セキュリティ hardening は今回の要件スコープ外とし、信頼済みローカル環境での利用を前提とする。

## ユーザー要件

### 要件一覧

- `UR-001`
  - 利用者はブラウザ UI から Bridge Server に接続できること。
- `UR-002`
  - 利用者はブラウザ UI から Codex セッションを開始できること。
- `UR-003`
  - 利用者はブラウザ UI からテキスト入力を送信し、Codex の応答を受信できること。
- `UR-004`
  - 利用者は Codex の途中経過と最終回答をブラウザ上で継続的に確認できること。
- `UR-005`
  - Codex は sandbox 制約なし、承認待ちなしで起動されること。
- `UR-006`
  - 新リポジトリは Codex のみを対象とし、Claude Code には対応しないこと。
- `UR-007`
  - 新リポジトリは worktree を考慮せず、単一の通常ディレクトリを作業ディレクトリとして扱うこと。
- `UR-008`
  - 実装は Podman コンテナ内で完結し、コンテナ外の追加セキュリティ制御を前提にしないこと。

## 成功条件

- ブラウザ UI から Bridge へ接続し、任意の project path で Codex セッションを開始できる。
- ブラウザから送った入力に対して、Codex の出力がストリーミングで表示される。
- Codex 起動時に sandbox / approval に関する制約が入らない。
- Claude Code 用 UI・分岐・互換レイヤーが含まれていない。
- worktree 専用の path 正規化や履歴解決ロジックが含まれていない。

## 明示的な非要件

- `NR-001`
  - Claude Code / Claude provider 対応は実装しない。
- `NR-002`
  - worktree 検出、worktree path 正規化、sidechain 復元は実装しない。
- `NR-003`
  - sandbox mode 切替 UI、approval mode 切替 UI、allowed dirs 制御は実装しない。
- `NR-004`
  - API key 認証、Push 通知、Firebase relay は初期スコープに含めない。
- `NR-005`
  - gallery、screenshot、diff viewer、recording、debug bundle、prompt history backup は初期スコープに含めない。
- `NR-006`
  - mDNS、service installer、doctor コマンドなどの運用補助機能は初期スコープに含めない。
- `NR-007`
  - session list、session rename、session delete、history restore、bridge restart 後の session persistence は初期スコープに含めない。

## 制約条件

- Podman コンテナ内で `codex` CLI が利用可能であること。
- Codex はフル権限起動を前提とするため、実装は `dangerously-bypass` 相当を標準挙動として扱うこと。
- ブラウザ UI は trusted local environment 前提でよく、厳格な認証認可は要求しない。
