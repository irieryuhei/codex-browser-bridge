const VIEWER_NEXT2_BODY = String.raw`  <div class="viewer2-shell">
    <header class="viewer2-banner">
      <div>
        <p class="viewer2-kicker">Codex Browser Bridge</p>
        <h1>Viewer Next 2</h1>
      </div>
      <div class="viewer2-status-cluster">
        <span id="connectionDot" class="viewer2-dot" aria-hidden="true"></span>
        <strong id="connectionLabel">Connecting...</strong>
        <span id="runtimeLabel">No session selected</span>
      </div>
    </header>

    <div class="viewer2-layout" id="viewer2Layout">
      <aside class="viewer2-sidebar panel" id="listPanel">
        <section class="viewer2-section">
          <div class="viewer2-section-heading">
            <h2>Bridge</h2>
            <p>Connect to the running bridge and start sessions.</p>
          </div>

          <div id="bridgeControls" class="viewer2-stack">
            <label class="viewer2-field">
              <span>Bridge URL</span>
              <input id="bridgeUrl" type="text" placeholder="ws://127.0.0.1:8765">
            </label>
            <button id="connectBtn" class="btn ghost" type="button">Reconnect Bridge</button>
          </div>

          <label class="viewer2-field">
            <span>Repository</span>
            <select id="projectPathPicker" hidden>
              <option value="">Select a repository</option>
            </select>
          </label>

          <details id="advancedControls" class="viewer2-advanced">
            <summary>Advanced Session Options</summary>
            <div class="viewer2-stack">
              <label class="viewer2-field">
                <span>Project Path</span>
                <input id="projectPath" type="text" placeholder="/workspace/project">
              </label>
              <div class="viewer2-grid">
                <label class="viewer2-field">
                  <span>Model</span>
                  <input id="modelInput" type="text" placeholder="Leave empty for Codex default">
                </label>
                <label class="viewer2-field">
                  <span>Reasoning Effort</span>
                  <select id="modelReasoningEffort">
                    <option value="minimal">minimal</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="xhigh">xhigh</option>
                  </select>
                </label>
              </div>
              <label class="viewer2-field">
                <span>Open Mode</span>
                <select id="permissionMode">
                  <option value="default">Default</option>
                  <option value="plan">Plan mode</option>
                </select>
              </label>
            </div>
          </details>

          <button id="startBtn" class="btn primary" type="button">Start Session</button>
        </section>

        <section class="viewer2-section">
          <div class="viewer2-section-heading">
            <h2>Conversations</h2>
            <p>Filter, page, and inspect sessions.</p>
          </div>

          <div class="viewer2-stack">
            <label class="viewer2-field">
              <span>Search</span>
              <input id="sessionFilterInput" type="text" placeholder="Filter conversations">
            </label>

            <label class="viewer2-field">
              <span>Repository Filter</span>
              <select id="sessionRepoFilter">
                <option value="">All repositories</option>
              </select>
            </label>

            <div class="viewer2-toggle-row">
              <label class="viewer2-toggle">
                <input id="unreadOnlyFilter" type="checkbox">
                <span>Unread only</span>
              </label>
              <label class="viewer2-toggle">
                <input id="includeAnsweringFilter" type="checkbox" checked>
                <span>Include answering</span>
              </label>
              <label class="viewer2-toggle">
                <input id="showCompletedFilter" type="checkbox" checked>
                <span>Show completed</span>
              </label>
            </div>

            <div class="viewer2-pagination">
              <button id="sessionListPrevBtn" class="btn ghost" type="button" disabled>Prev</button>
              <div id="sessionListSummary" class="viewer2-summary">No conversations yet.</div>
              <button id="sessionListNextBtn" class="btn ghost" type="button" disabled>Next</button>
            </div>
          </div>

          <div id="sessionsList" class="viewer2-session-list"></div>
        </section>
      </aside>

      <button
        id="listResizeHandle"
        class="viewer2-resizer"
        type="button"
        aria-label="Resize conversation list"
        aria-controls="listPanel"
        aria-orientation="vertical"
        aria-valuemin="280"
        aria-valuemax="760"
        aria-valuenow="360"
        title="Drag to resize the conversation list"
      ></button>

      <main class="viewer2-main panel" id="viewerPanel">
        <section class="viewer2-main-head">
          <div class="viewer2-main-heading">
            <div>
              <h2 id="viewerTitle">No session selected</h2>
              <p id="viewerSubtitle">Start a new chat or choose a conversation from the list.</p>
            </div>
            <div class="viewer2-badges">
              <span id="viewerRepoBadge" class="viewer2-badge" hidden></span>
              <span id="viewerModelBadge" class="viewer2-badge" hidden></span>
              <span id="viewerModeBadge" class="viewer2-badge" hidden></span>
            </div>
          </div>

          <div class="viewer2-main-actions">
            <button id="viewerBackBtn" class="btn warning mobile-only" type="button" hidden>Back to List</button>
            <button id="viewerPinBtn" class="btn ghost" type="button" disabled>Pin</button>
            <button id="viewerCompleteBtn" class="btn ghost" type="button" disabled>Complete</button>
          </div>
        </section>

        <section class="viewer2-composer">
          <div class="viewer2-composer-toolbar">
            <div class="viewer2-composer-actions">
              <button id="sendBtn" class="btn primary" type="button" disabled>Send</button>
              <button id="interruptBtn" class="btn ghost" type="button" disabled>Interrupt</button>
              <label class="viewer2-toggle inline">
                <input id="forceSendToggle" type="checkbox">
                <span>Force Send</span>
              </label>
            </div>
            <div id="composerHint" class="viewer2-hint"></div>
          </div>

          <label class="viewer2-field">
            <span>Prompt</span>
            <textarea id="composerInput" placeholder="Send a prompt to the selected session." disabled></textarea>
          </label>
        </section>

        <section id="permissionPanel" class="viewer2-permission" hidden></section>
        <section id="messages" class="viewer2-messages"></section>
      </main>
    </div>
  </div>`;

export function renderViewerNext2Html(): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="ja">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    "  <title>codex-browser-bridge viewer-next2</title>",
    '  <link rel="stylesheet" href="/viewer-next2/app.css">',
    "</head>",
    "<body>",
    VIEWER_NEXT2_BODY,
    '  <script defer src="/viewer-next2/app.js"></script>',
    "</body>",
    "</html>",
  ].join("\n");
}
