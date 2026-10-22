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

// ── CONFIG ─────────────────────────────────────────────────────────────

function config() {
  const settings = vscode.workspace.getConfiguration('rastin');
  return {
    enabled: settings.get('enabled', true),
    mode: settings.get('mode', 'auto'),
  };
}

function buildPayload(mode) {
  return payload.build({ root: __dirname, mode });
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
  const { enabled, mode } = config();
  const version = vscode.extensions.getExtension(
    'amir83nasr.rastin-claude-code',
  )?.packageJSON.version;

  if (!enabled) {
    const undo = await patch.remove({
      payload: buildPayload(mode),
    });
    if (undo.targets === 0) {
      notifyNoTarget();
      return;
    }
    log(`removed: ${describe(undo.changed)}`);
    if (interactive && undo.changed.length > 0) {
      await promptReload('Rastin removed from Claude Code');
    }
    return;
  }

  const applied = await patch.apply({
    payload: buildPayload(mode),
    version: version ?? 'dev',
  });
  if (applied.targets === 0) {
    notifyNoTarget();
    return;
  }
  log(`applied (${mode}): ${describe(applied.changed)}`);
  if (applied.changed.length > 0) {
    await promptReload(`Rastin applied to ${applied.targets} Claude Code build`);
  }
}

function describe(changed) {
  return changed.length === 0 ? 'no file changes' : changed.join(', ');
}

function notifyNoTarget() {
  vscode.window.showWarningMessage(
    'Rastin: no installed Claude Code VS Code extension (anthropic.claude-code-*) found.',
  );
}

async function promptReload(message) {
  const choice = await vscode.window.showInformationMessage(
    `${message}. Reload the window to apply.`,
    'Reload Window',
  );
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

function log(message) {
  if (!output) return;
  output.appendLine(`[${new Date().toISOString()}] ${message}`);
}

// ── STATUS BAR ─────────────────────────────────────────────────────────

function updateStatusBar() {
  if (!statusBar) return;
  const { enabled, mode } = config();
  if (!enabled) {
    statusBar.text = '$(globe) Rastin: Off';
    statusBar.tooltip = 'Rastin is disabled. Click to enable.';
    return;
  }
  const label = mode === 'auto' ? 'Auto' : mode.toUpperCase();
  statusBar.text = `$(globe) Rastin: ${label}`;
  statusBar.tooltip = `Rastin: IranYekanX font, ${label} direction. Click to change.`;
}

// ── COMMANDS ───────────────────────────────────────────────────────────

async function setMode(mode) {
  await vscode.workspace
    .getConfiguration('rastin')
    .update('mode', mode, vscode.ConfigurationTarget.Global);
}

async function setEnabled(enabled) {
  await vscode.workspace
    .getConfiguration('rastin')
    .update('enabled', enabled, vscode.ConfigurationTarget.Global);
}

async function showMenu() {
  const { enabled, mode } = config();
  /** @type {Array<vscode.QuickPickItem & {run: () => Promise<unknown>}>} */
  const items = [
    {
      label: '$(symbol-namespace) Auto',
      description:
        'per-message direction (Persian RTL, English opening LTR)',
      picked: enabled && mode === 'auto',
      run: () => setMode('auto'),
    },
    {
      label: '$(arrow-right) RTL',
      description: 'always right-to-left',
      picked: enabled && mode === 'rtl',
      run: () => setMode('rtl'),
    },
    {
      label: '$(arrow-left) LTR',
      description: 'always left-to-right, font stays on',
      picked: enabled && mode === 'ltr',
      run: () => setMode('ltr'),
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
      sync(true);
    }),
  );

  updateStatusBar();
  warnLegacy();
  sync(false);

  // A legacy RTL extension can re-patch on the same startup tick. Re-run
  // once after the dust settles; the patch is idempotent and a no-op when
  // the files already match.
  const settle = setTimeout(() => sync(false), 3000);
  context.subscriptions.push({ dispose: () => clearTimeout(settle) });
}

function deactivate() {
  statusBar?.dispose();
  output?.dispose();
}

module.exports = { activate, deactivate };
