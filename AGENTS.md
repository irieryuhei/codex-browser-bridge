# AGENTS.md instructions for /Users/irieryuuhei/Documents/qst-ProcessImprovement/codex-browser-bridge

## Skills

### Available skills

- playwright-cli: ブラウザ操作、自動テスト、スクリーンショット取得、UI確認に使う。 (file: /Users/irieryuuhei/Documents/qst-ProcessImprovement/codex-browser-bridge/.claude/skills/playwright-cli/SKILL.md)
- self-review: タスク完了前に差分と検証結果を見直し、回帰や抜け漏れを洗い出す。 (file: /Users/irieryuuhei/Documents/qst-ProcessImprovement/codex-browser-bridge/.claude/skills/self-review/SKILL.md)
- test-bridge: codex-browser-bridge のテスト、型チェック、ビルド確認、テスト追加方針に従う。 (file: /Users/irieryuuhei/Documents/qst-ProcessImprovement/codex-browser-bridge/.claude/skills/test-bridge/SKILL.md)

### How to use skills

- ユーザーが skill 名を指定した場合、または依頼内容が skill の説明に明確に一致する場合はその skill を使う。
- skill を使うときは、まず `SKILL.md` を開いて必要な範囲だけ読む。
- `references/` がある場合は、必要なファイルだけ読む。
- 複数 skill が当てはまる場合は、最小限の組み合わせだけ使う。
