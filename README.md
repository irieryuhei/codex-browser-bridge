# codex-browser-bridge

Podman コンテナ内で Codex をフル権限で動かし、ブラウザから利用するための最小構成 bridge です。

## 現在のスコープ

- Bridge 自身がブラウザ viewer を配信する
- ブラウザ viewer から Bridge WebSocket URL を指定して再接続できる
- ブラウザ viewer から project path を指定して Codex セッションを開始できる
- ブラウザ viewer からアクティブ session に prompt を送信し、必要に応じて割り込みできる
- ブラウザ viewer に status、commentary、final answer、tool 出力、error を表示できる
- `codex app-server` への WebSocket bridge を提供する
- Codex は `--dangerously-bypass-approvals-and-sandbox` 付きで起動する
- Codex 専用構成とする
- Claude には対応しない
- worktree には対応しない

要件資料は `doc/references/1RD/features/f0001-browser-codex-bridge/` にあります。

## 起動方法

```shell
npm install
npm run build
npm start
```

[http://127.0.0.1:8765/](http://127.0.0.1:8765/) を開いてください。

viewer は既定で same-origin の WebSocket URL を使います。必要ならブラウザ UI から Bridge URL を上書きできます。

## 動作確認

```shell
npm test
curl http://127.0.0.1:8765/health
```
