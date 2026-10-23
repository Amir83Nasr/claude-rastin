'use strict';

const vscode = require('vscode');
const patch = require('./lib/patch');
const payload = require('./lib/payload');

const LEGACY_ID = 'yechielby.claude-code-rtl';
const LEGACY_NAME = 'Claude Code RTL Support';

/** @type {vscode.OutputChannel | undefined} */
let output;
/** @type {vscode.StatusBarItem | undefined} */
let statusBar;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
let warnedLegacy = false;
/** @type {NodeJS.Timeout | undefined} */
let pendingSync;

// ── CONFIG ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  enabled: true,
  direction: 'auto',
  fontWeight: 400,
  fontFamily: 'IRANYekanX',
  fontFile: '',
  fontSize: 13,
  lineHeight: 2,
  codeFontFamily: '',
  theme: 'vscode',
};

function config() {
  const settings = vscode.workspace.getConfiguration('rastin');
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => [
      key,
      settings.get(key, fallback),
    ]),
  );
}

function buildPayload() {
  return payload.build({ root: __dirname, ...config() });
}

// ── SYNC ───────────────────────────────────────────────────────────────

function sync(interactive) {
  queue = queue
    .then(() => runSync(interactive))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log(message);
      vscode.window.showErrorMessage(`Rastin: ${message}`);
    });
  return queue;
}

async function runSync(interactive) {
  const { enabled } = config();
  const version = vscode.extensions.getExtension('amir83nasr.claude-rastin')
    ?.packageJSON.version;

  if (!enabled) {
    const undo = await patch.remove({ payload: buildPayload() });
    if (undo.targets === 0) {
      notifyNoTarget();
      return;
    }
    log(`removed: ${describe(undo.changed)}`);
    warnFailed(undo.failed, interactive);
    if (interactive && undo.changed.length > 0) await refreshWebviews();
    return;
  }

  const applied = await patch.apply({
    payload: buildPayload(),
    version: version ?? 'dev',
  });
  if (applied.targets === 0) {
    notifyNoTarget();
    return;
  }
  log(`applied (${applied.targets}): ${describe(applied.changed)}`);
  warnFailed(applied.failed, interactive);
  if (interactive && applied.changed.length > 0) await refreshWebviews();
}

function warnFailed(failed, interactive) {
  if (!failed || failed.length === 0) return;
  log(`failed: ${failed.join('; ')}`);
  if (!interactive) return;
  vscode.window.showWarningMessage(
    `Rastin: ${failed.length} Claude Code build(s) not patched. See the Rastin output channel.`,
  );
}

function describe(changed) {
  return changed.length === 0 ? 'no file changes' : changed.join(', ');
}

function notifyNoTarget() {
  vscode.window.showWarningMessage(
    'Rastin: no installed Claude Code VS Code extension (anthropic.claude-code-*) found.',
  );
}

// The patched CSS/JS only reaches the chat once its webview reloads. VS
// Code's own "Reload Webviews" command does that in place, so settings apply
// without a window reload.
async function refreshWebviews() {
  try {
    await vscode.commands.executeCommand(
      'workbench.action.webview.reloadWebviewAction',
    );
  } catch {
    const choice = await vscode.window.showInformationMessage(
      'Rastin: reload the window to apply the change.',
      'Reload Window',
    );
    if (choice) {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}

function log(message) {
  if (!output) return;
  output.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// ── STATUS BAR ─────────────────────────────────────────────────────────

function updateStatusBar() {
  if (!statusBar) return;
  const { enabled, direction, fontWeight, lineHeight } = config();
  if (!enabled) {
    statusBar.text = '$(globe) Rastin: Off';
    statusBar.tooltip = 'Rastin is disabled. Click to enable.';
    return;
  }
  statusBar.text = '$(globe) Rastin';
  const mode =
    direction === 'auto' ? 'automatic direction' : `forced ${direction}`;
  statusBar.tooltip = `Rastin: ${mode}, ${fontWeight} weight, line height ${lineHeight}. Click to manage.`;
}

// ── COMMANDS ───────────────────────────────────────────────────────────

async function setEnabled(enabled) {
  await vscode.workspace
    .getConfiguration('rastin')
    .update('enabled', enabled, vscode.ConfigurationTarget.Global);
}

async function showMenu() {
  const { enabled } = config();
  /** @type {Array<vscode.QuickPickItem & {run: () => Promise<unknown>}>} */
  const items = [
    {
      label: '$(settings-gear) Font, size, spacing, theme',
      description: 'open settings',
      run: () =>
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:amir83nasr.claude-rastin',
        ),
    },
    {
      label: '$(wrench) Repair after Claude Code update',
      run: () => sync(true),
    },
    {
      label: enabled ? '$(circle-slash) Disable' : '$(check) Enable',
      run: () => setEnabled(!enabled),
    },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Rastin — Claude Code',
  });
  if (pick) await pick.run();
}

// ── LEGACY ─────────────────────────────────────────────────────────────

function warnLegacy() {
  if (warnedLegacy) return;
  const legacy = vscode.extensions.getExtension(LEGACY_ID);
  if (!legacy || !legacy.isActive) return;
  warnedLegacy = true;
  vscode.window
    .showWarningMessage(
      `Rastin: ${LEGACY_NAME} is still active and re-patches the same Claude Code files. Disable it to keep Rastin's layout.`,
      'Open Extensions',
    )
    .then((choice) => {
      if (choice) {
        vscode.commands.executeCommand('workbench.view.extensions');
      }
    });
}

// ── ACTIVATION ─────────────────────────────────────────────────────────

function activate(context) {
  output = vscode.window.createOutputChannel('Rastin');
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.command = 'rastin.menu';
  statusBar.show();

  context.subscriptions.push(
    output,
    statusBar,
    vscode.commands.registerCommand('rastin.enable', () => setEnabled(true)),
    vscode.commands.registerCommand('rastin.disable', () => setEnabled(false)),
    vscode.commands.registerCommand('rastin.repair', () => sync(true)),
    vscode.commands.registerCommand('rastin.menu', showMenu),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('rastin')) return;
      updateStatusBar();
      // A number setting fires per keystroke; collapse the burst so the
      // webview reloads once.
      clearTimeout(pendingSync);
      pendingSync = setTimeout(() => sync(true), 250);
    }),
  );

  updateStatusBar();
  warnLegacy();
  sync(false);

  // A legacy RTL extension can re-patch on the same startup tick. Re-run
  // once after the dust settles; the patch is idempotent and a no-op when
  // the files already match.
  const settle = setTimeout(() => sync(false), 3000);
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(settle);
      clearTimeout(pendingSync);
    },
  });
}

function deactivate() {
  statusBar?.dispose();
  output?.dispose();
}

module.exports = { activate, deactivate };
