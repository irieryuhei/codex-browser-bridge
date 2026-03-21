export const VIEWER_NEXT_CSS = String.raw`    :root {
      color-scheme: light;
      --bg: #f5efe5;
      --panel: rgba(255, 251, 246, 0.94);
      --panel-strong: rgba(255, 248, 239, 0.98);
      --ink: #152329;
      --muted: #637177;
      --line: rgba(21, 35, 41, 0.12);
      --accent: #0f766e;
      --accent-strong: #115e59;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --commentary: #eef7f6;
      --final: #fdf1e3;
      --tool: #f4eadb;
      --user: #edf2f7;
      --error: #fff0ef;
      --queued: #f7f2df;
      --shadow: 0 24px 52px rgba(26, 37, 44, 0.09);
      --list-panel-width: 380px;
      font-family: "IBM Plex Sans", "Noto Sans JP", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 24%),
        radial-gradient(circle at bottom right, rgba(212, 140, 46, 0.14), transparent 28%),
        var(--bg);
    }

    .shell {
      max-width: 1380px;
      margin: 0 auto;
      padding: 14px 12px 18px;
    }

    .layout {
      display: grid;
      gap: 0;
      grid-template-columns: var(--list-panel-width) 18px minmax(0, 1fr);
      align-items: start;
    }

    body.resizing {
      cursor: col-resize;
      user-select: none;
    }

    .panel {
      background: var(--panel);
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
      min-width: 0;
      overflow: hidden;
    }

    #listPanel {
      max-height: calc(100vh - 32px);
      overflow: auto;
    }

    .list-resizer {
      position: relative;
      align-self: stretch;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: col-resize;
      touch-action: none;
    }

    .list-resizer:hover {
      transform: none;
    }

    .list-resizer::before {
      content: "";
      position: absolute;
      inset: 14px 7px;
      border-radius: 999px;
      background:
        linear-gradient(180deg, rgba(15, 118, 110, 0.1), rgba(15, 118, 110, 0.3), rgba(15, 118, 110, 0.1));
      transition: transform 120ms ease, background 120ms ease;
    }

    .list-resizer:hover::before,
    .list-resizer:focus-visible::before,
    body.resizing .list-resizer::before {
      transform: scaleX(1.15);
      background:
        linear-gradient(180deg, rgba(15, 118, 110, 0.16), rgba(15, 118, 110, 0.52), rgba(15, 118, 110, 0.16));
    }

    .list-resizer:focus-visible {
      outline: none;
    }

    .panel-header {
      padding: 16px 18px 0;
    }

    .panel-header h2 {
      margin: 0;
      font-size: 15px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .session-list-controls {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .session-filter-row {
      display: grid;
      gap: 8px;
    }

    .filter-toggle-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: center;
    }

    .filter-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 700;
    }

    .filter-toggle input {
      width: auto;
      margin: 0;
    }

    .session-list-nav {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .session-list-summary {
      font-size: 12px;
      color: var(--muted);
    }

    .advanced-controls {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,255,0.46);
      overflow: hidden;
    }

    .advanced-controls summary {
      cursor: pointer;
      list-style: none;
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }

    .advanced-controls summary::-webkit-details-marker {
      display: none;
    }

    .advanced-controls-body {
      display: grid;
      gap: 12px;
      padding: 0 14px 14px;
    }

    .controls {
      display: grid;
      gap: 12px;
      padding: 18px;
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.44), rgba(255,255,255,0)),
        var(--panel-strong);
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }

    input, textarea, button, select {
      font: inherit;
    }

    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 11px 13px;
      background: rgba(255,255,255,0.9);
      color: var(--ink);
      outline: none;
    }

    textarea {
      min-height: 110px;
      resize: vertical;
    }

    input:focus, textarea:focus, select:focus {
      border-color: rgba(15, 118, 110, 0.44);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
    }

    .row {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .button-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .mobile-only {
      display: none;
    }

    button {
      border: 0;
      border-radius: 14px;
      padding: 11px 15px;
      cursor: pointer;
      font-weight: 700;
      transition: transform 120ms ease, opacity 120ms ease;
    }

    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: default; transform: none; }

    .primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #fff;
    }

    .secondary {
      background: rgba(255,255,255,0.94);
      color: var(--ink);
      border: 1px solid var(--line);
    }

    .back-to-list {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff;
      border: 1px solid rgba(124, 45, 18, 0.18);
      box-shadow: 0 10px 22px rgba(180, 83, 9, 0.22);
    }

    .back-to-list:hover {
      box-shadow: 0 14px 28px rgba(180, 83, 9, 0.28);
    }

    .back-to-list:focus-visible {
      outline: 3px solid rgba(217, 119, 6, 0.24);
      outline-offset: 2px;
    }

    .statusbar {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 14px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #d97706;
      box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.15);
    }

    .dot.connected {
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.16);
    }

    .sessions {
      display: grid;
      gap: 10px;
      padding: 16px 18px 18px;
    }

    .session-button {
      width: 100%;
      min-width: 0;
      text-align: left;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--session-border, var(--line));
      background:
        linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0)),
        var(--session-bg, rgba(255,255,255,0.72));
      display: grid;
      gap: 6px;
    }

    .session-button:hover {
      border-color: var(--session-border-strong, rgba(15, 118, 110, 0.3));
    }

    .session-button.pinned {
      border-color: rgba(15, 118, 110, 0.42);
      box-shadow:
        inset 4px 0 0 rgba(15, 118, 110, 0.76),
        0 10px 24px rgba(15, 118, 110, 0.08);
      background:
        linear-gradient(180deg, rgba(15, 118, 110, 0.1), rgba(255, 255, 255, 0.04)),
        var(--session-bg, rgba(255, 255, 255, 0.72));
    }

    .session-button.active {
      border-color: var(--session-border-strong, rgba(15, 118, 110, 0.34));
      box-shadow:
        inset 0 0 0 1px var(--session-border-strong, rgba(15, 118, 110, 0.22)),
        0 0 0 3px var(--session-ring, rgba(15, 118, 110, 0.14));
      background:
        linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.04)),
        var(--session-bg, rgba(255,255,255,0.88));
    }

    .session-button.pinned::before {
      content: "Pinned";
      display: inline-flex;
      align-self: start;
      justify-self: start;
      width: fit-content;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent-strong);
    }

    .session-button.pinned .session-title {
      color: var(--accent-strong);
    }

    .session-button.pinned .session-time,
    .session-button.pinned .session-preview {
      color: #46575d;
    }

    .session-list-divider {
      width: 100%;
      margin: 2px 0;
      border: 0;
      height: 1px;
      background: linear-gradient(90deg, rgba(21, 35, 41, 0), rgba(15, 118, 110, 0.45), rgba(21, 35, 41, 0));
    }

    .session-button.completed {
      border-color: rgba(99, 113, 119, 0.18);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0)),
        rgba(122, 134, 139, 0.16);
      box-shadow: none;
      opacity: 0.82;
    }

    .session-button.completed.active {
      border-color: rgba(99, 113, 119, 0.24);
      box-shadow:
        inset 0 0 0 1px rgba(99, 113, 119, 0.14),
        0 0 0 3px rgba(99, 113, 119, 0.08);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02)),
        rgba(122, 134, 139, 0.2);
    }

    .session-button.completed::before,
    .session-button.completed .session-title,
    .session-button.completed .session-time,
    .session-button.completed .session-preview,
    .session-button.completed .session-status {
      color: #637177;
    }

    .session-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--ink);
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .session-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .session-title-group {
      display: flex;
      align-items: baseline;
      flex: 1 1 auto;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }

    .session-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
      letter-spacing: 0.08em;
    }

    .session-badge.unread {
      border-color: rgba(217, 119, 6, 0.22);
      background: rgba(217, 119, 6, 0.14);
      color: #92400e;
    }

    .session-time {
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .session-status {
      width: 24px;
      min-width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid rgba(21, 35, 41, 0.12);
      background: rgba(21, 35, 41, 0.06);
      color: var(--muted);
    }

    .session-status-spinner {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      border: 2px solid currentColor;
      border-right-color: transparent;
      animation: session-status-spin 0.85s linear infinite;
    }

    @keyframes session-status-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .session-preview {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .viewer {
      min-height: calc(100vh - 120px);
      display: grid;
      grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
    }

    .viewer-head {
      padding: 18px;
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(180deg, rgba(255,255,255,0.44), rgba(255,255,255,0)),
        var(--panel-strong);
      display: grid;
      gap: 12px;
    }

    .viewer-title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      flex-wrap: wrap;
    }

    .viewer-title-block h2 {
      margin: 0 0 6px;
      font-size: 26px;
      line-height: 1.05;
    }

    .viewer-title-block p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }

    .viewer-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.86);
      border: 1px solid var(--line);
      font-size: 12px;
      color: var(--muted);
    }

    .permission-panel {
      margin: 0 18px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid rgba(15, 118, 110, 0.18);
      background: rgba(15, 118, 110, 0.08);
      display: grid;
      gap: 12px;
    }

    .queued-panel {
      margin: 0 18px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(212, 140, 46, 0.22);
      background: var(--queued);
      display: grid;
      gap: 8px;
    }

    .queued-panel h3,
    .permission-panel h3 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .queued-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
    }

    .messages {
      padding: 18px;
      display: grid;
      gap: 12px;
      align-content: start;
      min-width: 0;
      overflow: auto;
    }

    .message-card,
    .conversation-collapse {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,255,0.82);
      overflow: hidden;
    }

    .message-card {
      padding: 14px 16px;
    }

    .message-card.commentary { background: var(--commentary); }
    .message-card.final { background: var(--final); }
    .message-card.tool { background: var(--tool); }
    .message-card.user { background: var(--user); }
    .message-card.error { background: var(--error); }
    .message-card-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
    }

    .message-body {
      min-width: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.6;
      position: relative;
    }

    .message-card.final.expandable .message-body {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 5;
      overflow: hidden;
    }

    .message-card.final.expandable:not([data-expanded="true"]) .message-body::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 2.4em;
      background: linear-gradient(180deg, rgba(253, 241, 227, 0), var(--final));
      pointer-events: none;
    }

    .message-card.final[data-expanded="true"] .message-body {
      display: block;
      overflow: visible;
      -webkit-line-clamp: unset;
    }

    .message-expand-toggle {
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--accent-strong);
      font-size: 12px;
      font-weight: 700;
    }

    .message-expand-toggle:hover {
      transform: none;
      text-decoration: underline;
    }

    .message-expand-toggle:focus-visible {
      outline: 2px solid rgba(15, 118, 110, 0.32);
      outline-offset: 2px;
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .message-timestamp {
      letter-spacing: normal;
      text-transform: none;
      font-weight: 600;
      white-space: nowrap;
    }

    .conversation-collapse summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      padding: 14px 16px;
      background: rgba(255,255,255,0.74);
      font-size: 13px;
      color: var(--muted);
    }

    .conversation-collapse summary::-webkit-details-marker {
      display: none;
    }

    .conversation-collapse-body {
      display: grid;
      gap: 10px;
      padding: 0 14px 14px;
    }

    .composer {
      display: grid;
      gap: 12px;
      padding: 18px;
      border-top: 1px solid var(--line);
      background: rgba(255, 250, 243, 0.94);
    }

    .composer-toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .toggle-inline {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--muted);
      white-space: nowrap;
    }

    .hint {
      font-size: 13px;
      color: var(--muted);
    }

    @media (max-width: 980px) {
      .layout {
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .layout.mobile-list-open #viewerPanel {
        display: none;
      }

      .layout.mobile-viewer-open #listPanel {
        display: none;
      }

      .sessions {
        max-height: none;
      }

      #listPanel {
        max-height: none;
        overflow: visible;
      }

      .list-resizer {
        display: none;
      }

      .viewer {
        min-height: auto;
      }

      .row {
        grid-template-columns: 1fr;
      }

      .viewer-title-row {
        flex-direction: column;
      }

      .mobile-only {
        display: inline-flex;
      }
    }`;
