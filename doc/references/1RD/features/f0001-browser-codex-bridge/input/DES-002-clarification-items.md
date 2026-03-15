# DES-002 確認事項

## 文書管理

- Scope ID: `f0001-browser-codex-bridge`
- Status: CLOSED
- Updated: 2026-03-15

## 確認事項の要約

今回の要件で曖昧になりやすい論点は、すべて 2026-03-15 のユーザー指示で確定済みとする。  
この文書では、実装時にブレやすい判断を固定値として残す。

## 確定事項

| ID | 論点 | 決定内容 | 状態 |
| --- | --- | --- | --- |
| `CI-001` | 実行環境 | 新リポジトリは常に Podman コンテナ内で稼働する。 | CLOSED |
| `CI-002` | provider 対応 | Codex のみ対応する。Claude Code は対象外。 | CLOSED |
| `CI-003` | sandbox 方針 | Codex は sandbox なしで実行する。 | CLOSED |
| `CI-004` | approval 方針 | Codex は承認待ちなしで実行する。 | CLOSED |
| `CI-005` | セキュリティ範囲 | セキュリティ hardening は基本的に考慮不要。 | CLOSED |
| `CI-006` | worktree 対応 | worktree には対応しない。通常ディレクトリのみ扱う。 | CLOSED |
| `CI-007` | プロダクト範囲 | 実現したい中心要件は「ブラウザから Codex を呼び出す」「Codex が制限なく活動できる」の 2 点に絞る。 | CLOSED |
| `CI-008` | 旧 ccpocket との一致範囲 | 旧 repo にある周辺機能は必須ではなく、MVP から除外してよい。 | CLOSED |

## 実装時の固定前提

- `FA-001`
  - Codex 起動コマンドはフル権限前提とし、sandbox/approval を無効化する。
- `FA-002`
  - Bridge と browser viewer 間の通信は認証なしの trusted local network 前提でよい。
- `FA-003`
  - Browser UI は最小限でよく、少なくとも接続、セッション開始、入力送信、ストリーミング表示ができればよい。
- `FA-004`
  - 初期実装では「再接続後の過去セッション一覧」よりも「現在の会話をブラウザから使えること」を優先する。
- `FA-005`
  - project path は worktree 解決なしで、そのまま Codex の作業ディレクトリへ渡す。

## スコープ外として確定した事項

- `OS-001`
  - security policy の詳細設計は行わない。
- `OS-002`
  - multi-user 運用は考慮しない。
- `OS-003`
  - 旧 `ccpocket` の debug / gallery / push / backup / screenshot 系 API は引き継がない。

## 未解決事項

現時点で要件上の未解決事項はない。  
以後の追加要求は、この文書へ新規項目として追記する。
