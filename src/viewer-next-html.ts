const VIEWER_NEXT_BODY = String.raw`  <div class="shell">
    <div class="layout">
      <section id="listPanel" class="panel">
        <div class="controls">
          <div class="statusbar">
            <span id="connectionDot" class="dot"></span>
            <strong id="connectionLabel">Connecting...</strong>
            <span id="runtimeLabel">No session selected</span>
          </div>

          <div id="bridgeControls">
            <label>
              Bridge URL
              <input id="bridgeUrl" type="text" placeholder="ws://127.0.0.1:8765">
            </label>

            <div class="button-row">
              <button id="connectBtn" class="secondary" type="button">Reconnect Bridge</button>
            </div>
          </div>

          <label>
            Project path
            <select id="projectPathPicker" hidden>
              <option value="">Select a repository</option>
            </select>
          </label>

          <details id="advancedControls" class="advanced-controls">
            <summary>Advanced Session Options</summary>
            <div class="advanced-controls-body">
              <label>
                Project path (manual)
                <input id="projectPath" type="text" placeholder="/workspace/project">
              </label>

              <div class="row">
                <label>
                  Model
                  <input id="modelInput" type="text" placeholder="Leave empty for Codex default">
                </label>
                <label>
                  Reasoning effort
                  <select id="modelReasoningEffort">
                    <option value="minimal">minimal</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="xhigh">xhigh</option>
                  </select>
                </label>
              </div>

              <div class="row">
                <label>
                  Open mode
                  <select id="permissionMode">
                    <option value="default">Default</option>
                    <option value="plan">Plan mode</option>
                  </select>
                </label>
              </div>
            </div>
          </details>

          <div class="button-row">
            <button id="startBtn" class="primary" type="button">Start Session</button>
          </div>
        </div>

        <div class="panel-header">
          <h2>Conversation List</h2>
          <div class="session-list-controls">
            <input id="sessionFilterInput" type="text" placeholder="Filter conversations">
            <div class="session-filter-row">
              <select id="sessionRepoFilter">
                <option value="">All repositories</option>
              </select>
              <div class="filter-toggle-row">
                <label class="filter-toggle">
                  <input id="unreadOnlyFilter" type="checkbox">
                  <span>未読のみ</span>
                </label>
                <label class="filter-toggle">
                  <input id="includeAnsweringFilter" type="checkbox" checked>
                  <span>回答中を含める</span>
                </label>
                <label class="filter-toggle">
                  <input id="showCompletedFilter" type="checkbox" checked>
                  <span>完了を含める</span>
                </label>
              </div>
            </div>
            <div class="session-list-nav">
              <button id="sessionListPrevBtn" class="secondary" type="button" disabled>Prev</button>
              <button id="sessionListNextBtn" class="secondary" type="button" disabled>Next</button>
            </div>
            <div id="sessionListSummary" class="session-list-summary">No conversations yet.</div>
          </div>
        </div>
        <div id="sessionsList" class="sessions"></div>
      </section>

      <button
        id="listResizeHandle"
        class="list-resizer"
        type="button"
        aria-label="Resize conversation list"
        aria-controls="listPanel"
        aria-orientation="vertical"
        aria-valuemin="280"
        aria-valuemax="720"
        aria-valuenow="380"
        title="Drag to resize the conversation list"
      ></button>

      <section id="viewerPanel" class="panel viewer">
        <div class="viewer-head">
          <div class="viewer-title-row">
            <div class="viewer-title-block">
              <h2 id="viewerTitle">No session selected</h2>
              <p id="viewerSubtitle">Start a new chat or choose one from the list to inspect its conversation.</p>
            </div>
            <div class="viewer-badges">
              <div id="viewerRepoBadge" class="badge" hidden></div>
              <div id="viewerModelBadge" class="badge" hidden></div>
              <div id="viewerModeBadge" class="badge" hidden></div>
            </div>
          </div>

          <div class="button-row">
            <button id="viewerBackBtn" class="secondary back-to-list mobile-only" type="button" hidden>Back to List</button>
            <button id="viewerPinBtn" class="secondary" type="button" disabled>Pin</button>
            <button id="viewerCompleteBtn" class="secondary" type="button" disabled>Complete</button>
          </div>
        </div>

        <div class="composer">
          <div class="composer-toolbar">
            <div class="composer-actions">
              <button id="sendBtn" class="primary" type="button" disabled>Send</button>
              <button id="interruptBtn" class="secondary" type="button" disabled>Interrupt</button>
              <label class="toggle-inline">
                <input id="forceSendToggle" type="checkbox">
                <span>Force Send</span>
              </label>
            </div>
            <div id="composerHint" class="hint"></div>
          </div>
          <label>
            Prompt
            <textarea id="composerInput" placeholder="Send a prompt to the selected session." disabled></textarea>
          </label>
        </div>

        <section id="permissionPanel" class="permission-panel" hidden></section>

        <div id="messages" class="messages"></div>
      </section>
    </div>
  </div>
`;

export function renderViewerNextHtml(): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>codex-browser-bridge</title>',
    '  <link rel="stylesheet" href="/viewer-next/app.css">',
    '</head>',
    '<body>',
    VIEWER_NEXT_BODY,
    '  <script defer src="/viewer-next/app.js"></script>',
    '</body>',
    '</html>',
  ].join('\n');
}
