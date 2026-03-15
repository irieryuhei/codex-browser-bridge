# RD-001 要件定義

## 文書管理

- Scope ID: `f0001-browser-codex-bridge`
- Status: ACTIVE
- Updated: 2026-03-15

## 目的

Podman コンテナ内の Codex をブラウザから利用するための、新リポジトリの初期リリース要件を固定する。

## スコープ内

- Browser UI から Bridge Server へ接続する機能
- Browser UI から Codex セッションを開始する機能
- Browser UI から Codex へテキスト入力を送る機能
- Codex の streaming 出力を browser UI に表示する機能
- Codex をフル権限で起動する機能
- Codex 専用構成への単純化

## スコープ外

- Claude Code 対応
- worktree 対応
- sandbox / approval / allowed dirs / API key などの制御
- Firebase / Push 通知
- gallery / image upload / screenshot / diff / recording / debug bundle
- recent sessions の高度な検索・既読管理・完了管理
- service setup、mDNS、doctor などの運用補助

## 機能要件

- `FR-001 ブラウザ接続`
  - ブラウザ UI は利用者が指定した Bridge WebSocket URL に接続できること。

- `FR-002 セッション開始`
  - ブラウザ UI は project path を指定して Codex セッションを開始できること。

- `FR-003 プロンプト送信`
  - ブラウザ UI はアクティブな Codex セッションに対してテキスト入力を送信できること。

- `FR-004 ストリーミング表示`
  - ブラウザ UI は Codex の commentary と final answer を区別して表示できること。

- `FR-005 セッション状態表示`
  - ブラウザ UI は status、error、tool 実行中の進行状況を表示できること。

- `FR-006 制限なし Codex 実行`
  - Bridge Server は Codex を sandbox / approval 無効化状態で起動すること。

- `FR-007 Codex 専用`
  - 実装は Codex のみを扱い、provider 分岐や Claude 用互換処理を持たないこと。

- `FR-008 通常ディレクトリ実行`
  - 作業ディレクトリは通常の project path として扱い、worktree 専用ロジックを持たないこと。

- `FR-009 セッション管理レイヤーなし`
  - MVP では session list、history restore、rename、delete、archive などの管理機能を持たないこと。

## 非機能要件

- `NFR-001 実行環境前提`
  - システムは Podman コンテナ内稼働を前提とする。

- `NFR-002 信頼済み環境前提`
  - システムは trusted local environment を前提とし、セキュリティ hardening を要件としない。

- `NFR-003 最小リポジトリ構成`
  - リポジトリ構成は最小限とし、要求 2 点の達成に不要な周辺機能は初期実装に含めない。

- `NFR-004 エンドツーエンドの単純性`
  - Browser -> Bridge -> Codex の 1 経路が追いやすい単純な構成であること。

- `NFR-005 セッション永続化なし`
  - Bridge restart をまたぐ session/history persistence は初期実装に含めないこと。

## 受け入れ条件

- 利用者がブラウザを開き、Bridge URL を入力して接続できる。
- 利用者が project path を指定して会話を開始できる。
- 利用者がプロンプトを送ると、Codex 応答がブラウザへ流れる。
- Codex は承認待ちや sandbox で停止しない。
- リポジトリ内に Claude / worktree / security hardening 前提の複雑な分岐が含まれない。
- recent sessions 管理や restart restore を前提にした周辺機能が含まれない。
