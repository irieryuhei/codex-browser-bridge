const VIEWER_NEXT3_BODY = String.raw`  <div class="n3-shell">
    <header class="n3-hero">
      <div class="n3-hero-copy">
        <p class="n3-overline">Browser Codex Console</p>
        <h1>Viewer Next 3</h1>
        <p class="n3-lead">A requirements-only rebuild for multi-session Codex work.</p>
      </div>
      <div class="n3-status-strip">
        <span id="connectionDot" class="n3-dot" aria-hidden="true"></span>
        <strong id="connectionLabel">Connecting...</strong>
        <span id="runtimeLabel">No session selected</span>
      </div>
    </header>

    <div class="n3-layout" id="n3Layout">
      <aside class="n3-sidebar n3-panel" id="listPanel">
        <section class="n3-section">
          <div class="n3-section-head">
            <h2>Bridge</h2>
            <p>Connect to the server and launch sessions.</p>
          </div>

          <div id="bridgeControls" class="n3-stack">
            <label class="n3-field">
              <span>Bridge URL</span>
              <input id="bridgeUrl" type="text" placeholder="ws://127.0.0.1:8765">
            </label>
            <button id="connectBtn" class="n3-button secondary" type="button">Reconnect Bridge</button>
          </div>

          <label class="n3-field">
            <span>Repository</span>
            <select id="projectPathPicker" hidden>
              <option value="">Select a repository</option>
            </select>
          </label>

          <details id="advancedControls" class="n3-advanced">
            <summary>Advanced Session Options</summary>
            <div class="n3-stack">
              <label class="n3-field">
                <span>Project Path</span>
                <input id="projectPath" type="text" placeholder="/workspace/project">
              </label>
              <div class="n3-grid">
                <label class="n3-field">
                  <span>Model</span>
                  <input id="modelInput" type="text" placeholder="Leave empty for Codex default">
                </label>
                <label class="n3-field">
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
              <label class="n3-field">
                <span>Open Mode</span>
                <select id="permissionMode">
                  <option value="default">Default</option>
                  <option value="plan">Plan mode</option>
                </select>
              </label>
            </div>
          </details>

          <button id="startBtn" class="n3-button primary" type="button">Start Session</button>
        </section>

        <section class="n3-section">
          <div class="n3-section-head">
            <h2>Conversations</h2>
            <p>Browse, filter, and monitor active threads.</p>
          </div>

          <div class="n3-stack">
            <label class="n3-field">
              <span>Search</span>
              <input id="sessionFilterInput" type="text" placeholder="Filter conversations">
            </label>
            <label class="n3-field">
              <span>Repository Filter</span>
              <select id="sessionRepoFilter">
                <option value="">All repositories</option>
              </select>
            </label>
            <div class="n3-chip-row">
              <label class="n3-chip-toggle">
                <input id="unreadOnlyFilter" type="checkbox">
                <span>Unread only</span>
              </label>
              <label class="n3-chip-toggle">
                <input id="includeAnsweringFilter" type="checkbox" checked>
                <span>Include answering</span>
              </label>
              <label class="n3-chip-toggle">
                <input id="showCompletedFilter" type="checkbox" checked>
                <span>Show completed</span>
              </label>
            </div>
            <div class="n3-pager">
              <button id="sessionListPrevBtn" class="n3-button secondary" type="button" disabled>Prev</button>
              <div id="sessionListSummary" class="n3-summary">No conversations yet.</div>
              <button id="sessionListNextBtn" class="n3-button secondary" type="button" disabled>Next</button>
            </div>
          </div>

          <div id="sessionsList" class="n3-session-list"></div>
        </section>
      </aside>

      <button
        id="listResizeHandle"
        class="n3-resizer"
        type="button"
        aria-label="Resize conversation list"
        aria-controls="listPanel"
        aria-orientation="vertical"
        aria-valuemin="280"
        aria-valuemax="760"
        aria-valuenow="348"
        title="Resize conversation list"
      ></button>

      <main class="n3-main n3-panel" id="viewerPanel">
        <section class="n3-main-header">
          <div class="n3-title-row">
            <div class="n3-title-copy">
              <h2 id="viewerTitle">No session selected</h2>
              <p id="viewerSubtitle">Start a new chat or choose one from the list.</p>
            </div>
            <div class="n3-badge-row">
              <span id="viewerRepoBadge" class="n3-badge" hidden></span>
              <span id="viewerModelBadge" class="n3-badge" hidden></span>
              <span id="viewerModeBadge" class="n3-badge" hidden></span>
            </div>
          </div>
          <div class="n3-toolbar">
            <button id="viewerBackBtn" class="n3-button warning mobile-only" type="button" hidden>Back to List</button>
            <button id="viewerPinBtn" class="n3-button secondary" type="button" disabled>Pin</button>
            <button id="viewerCompleteBtn" class="n3-button secondary" type="button" disabled>Complete</button>
          </div>
        </section>

        <section class="n3-composer">
          <div class="n3-composer-head">
            <div class="n3-composer-actions">
              <button id="sendBtn" class="n3-button primary" type="button" disabled>Send</button>
              <button id="interruptBtn" class="n3-button secondary" type="button" disabled>Interrupt</button>
              <label class="n3-chip-toggle inline">
                <input id="forceSendToggle" type="checkbox">
                <span>Force Send</span>
              </label>
            </div>
            <div id="composerHint" class="n3-hint"></div>
          </div>
          <label class="n3-field">
            <span>Prompt</span>
            <textarea id="composerInput" placeholder="Send a prompt to the selected session." disabled></textarea>
          </label>
        </section>

        <section id="permissionPanel" class="n3-permission" hidden></section>
        <section id="messages" class="n3-messages"></section>
      </main>
    </div>
  </div>`;

export function renderViewerNext3Html(): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="ja">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    "  <title>codex-browser-bridge viewer-next3</title>",
    '  <link rel="stylesheet" href="/viewer-next3/app.css">',
    "</head>",
    "<body>",
    VIEWER_NEXT3_BODY,
    '  <script defer src="/viewer-next3/app.js"></script>',
    "</body>",
    "</html>",
  ].join("\n");
}
