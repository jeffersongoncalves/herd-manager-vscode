import * as vscode from 'vscode';
import { DEFAULT_PHP, isValidSiteName, siteNameFromFolder } from './core/herdConfig';
import { HerdState, configOrDefault, phpVersions, readState, runHerd, saveConfig } from './herd';

let state: HerdState = readState();

export function activate(context: vscode.ExtensionContext) {
  const view = new HerdViewProvider();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'herd.focus';

  const refresh = () => {
    state = readState();
    void vscode.commands.executeCommand('setContext', 'herd.linked', state.linked);
    void vscode.commands.executeCommand('setContext', 'herd.installed', !!state.executable);
    renderStatus(status);
    view.refresh();
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/herd.yml');
  watcher.onDidChange(refresh);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete(refresh);

  context.subscriptions.push(
    status,
    watcher,
    vscode.window.registerTreeDataProvider('herd.view', view),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.commands.registerCommand('herd.focus', () => vscode.commands.executeCommand('herd.view.focus')),
    vscode.commands.registerCommand('herd.refresh', refresh),
    vscode.commands.registerCommand('herd.configure', async () => {
      if (await configure()) {
        refresh();
        const answer = await vscode.window.showInformationMessage('herd.yml saved.', 'Link Site');
        if (answer === 'Link Site') {
          await link(refresh);
        }
      }
    }),
    vscode.commands.registerCommand('herd.editName', () => edit(refresh, 'name')),
    vscode.commands.registerCommand('herd.editPhp', () => edit(refresh, 'php')),
    vscode.commands.registerCommand('herd.toggleHttps', () => edit(refresh, 'secured')),
    vscode.commands.registerCommand('herd.link', () => link(refresh)),
    vscode.commands.registerCommand('herd.unlink', () => unlink(refresh)),
    vscode.commands.registerCommand('herd.openInBrowser', () => {
      if (state.url) {
        void vscode.env.openExternal(vscode.Uri.parse(state.url));
      } else {
        void vscode.window.showWarningMessage('Configure the Herd site first.');
      }
    }),
  );

  refresh();
  void startupHint();
}

export function deactivate() {}

async function startupHint() {
  if (!state.executable || !state.root) {
    return;
  }
  if (!state.config) {
    const answer = await vscode.window.showInformationMessage('No herd.yml found. Configure this project for Laravel Herd?', 'Configure Now');
    if (answer) {
      await vscode.commands.executeCommand('herd.configure');
    }
  } else if (!state.linked && state.config.name) {
    const answer = await vscode.window.showInformationMessage(`Herd site '${state.config.name}' is configured but not linked.`, 'Link Now');
    if (answer) {
      await vscode.commands.executeCommand('herd.link');
    }
  }
}

/** Site name → PHP version → HTTPS wizard. Returns false when cancelled. */
async function configure(): Promise<boolean> {
  const current = configOrDefault(state);

  const name = await askName(current.name);
  if (name === undefined) {
    return false;
  }
  const php = await askPhp(current.php);
  if (php === undefined) {
    return false;
  }
  const https = await vscode.window.showQuickPick(['Yes', 'No'], { title: 'Herd: Enable HTTPS?', placeHolder: current.secured ? 'Yes' : 'No' });
  if (https === undefined) {
    return false;
  }

  return save({ name, php, secured: https === 'Yes' });
}

async function edit(refresh: () => void, field: 'name' | 'php' | 'secured') {
  const config = configOrDefault(state);

  if (field === 'name') {
    const name = await askName(config.name);
    if (name === undefined) return;
    config.name = name;
  } else if (field === 'php') {
    const php = await askPhp(config.php);
    if (php === undefined) return;
    config.php = php;
  } else {
    config.secured = !config.secured;
  }

  if (save(config)) {
    refresh();
  }
}

function save(config: { name: string; php: string; secured: boolean }): boolean {
  try {
    saveConfig(state, config);
    return true;
  } catch (err: any) {
    void vscode.window.showErrorMessage(`Herd: failed to save herd.yml: ${err.message}`);
    return false;
  }
}

function askName(value: string): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Herd: Site name',
    value,
    prompt: `Folder default: ${siteNameFromFolder(state.folderName)}`,
    validateInput: (v) => (isValidSiteName(v.trim()) ? undefined : 'Use lowercase letters, numbers and dashes.'),
  }).then((v) => v?.trim());
}

async function askPhp(current: string): Promise<string | undefined> {
  const versions = phpVersions();
  const items = (versions.includes(current) ? versions : [current, ...versions]).map((v) => ({
    label: v,
    description: v === current ? 'current' : undefined,
  }));
  const picked = await vscode.window.showQuickPick(items, { title: 'Herd: PHP version', placeHolder: current || DEFAULT_PHP });
  return picked?.label;
}

async function link(refresh: () => void) {
  if (!state.config && !save(configOrDefault(state))) {
    return;
  }
  refresh();
  const config = configOrDefault(state);

  await herd(`Linking '${config.name}'...`, ['link', config.name]);
  if (config.secured) {
    await herd(`Securing '${config.name}.${state.tld}'...`, ['secure', `${config.name}.${state.tld}`]);
  }
  refresh();
}

async function unlink(refresh: () => void) {
  const name = state.config?.name;
  if (!name) {
    return;
  }
  await herd(`Unlinking '${name}'...`, ['unlink', name]);
  refresh();
}

function herd(title: string, args: string[]): Thenable<void> {
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Herd: ${title}` }, async () => {
    try {
      void vscode.window.showInformationMessage(`Herd: ${await runHerd(state, args)}`);
    } catch (err: any) {
      void vscode.window.showErrorMessage(`Herd: ${err.message}`);
    }
  });
}

function renderStatus(status: vscode.StatusBarItem) {
  if (!state.executable || !state.root) {
    status.hide();
    return;
  }
  if (state.linked) {
    status.text = '$(link) Herd';
    status.tooltip = state.url ?? 'Herd: linked';
  } else {
    status.text = '$(debug-disconnect) Herd';
    status.tooltip = state.config ? 'Herd: not linked — click to manage' : 'Herd: not configured — click to configure';
  }
  status.show();
}

class HerdViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  refresh() {
    this.changed.fire();
  }

  getTreeItem(item: vscode.TreeItem) {
    return item;
  }

  getChildren(): vscode.TreeItem[] {
    if (!state.executable) {
      return [item('Laravel Herd not found', 'Install Herd or add it to PATH', 'error')];
    }
    if (!state.root) {
      return [item('No folder open', undefined, 'folder')];
    }

    const config = configOrDefault(state);
    const statusLabel = state.linked ? 'Linked' : state.config ? 'Not linked' : 'Not configured';

    return [
      item(statusLabel, state.config ? undefined : 'Click to configure', state.linked ? 'pass' : 'circle-slash', state.config ? undefined : 'herd.configure'),
      item('URL', state.url ?? 'N/A', 'globe', state.url ? 'herd.openInBrowser' : undefined),
      item('Site name', config.name, 'symbol-string', 'herd.editName'),
      item('PHP', config.php, 'versions', 'herd.editPhp'),
      item('HTTPS', config.secured ? 'on' : 'off', config.secured ? 'lock' : 'unlock', 'herd.toggleHttps'),
    ];
  }
}

function item(label: string, description: string | undefined, icon: string, command?: string): vscode.TreeItem {
  const node = new vscode.TreeItem(label);
  node.description = description;
  node.iconPath = new vscode.ThemeIcon(icon);
  if (command) {
    node.command = { command, title: label };
  }
  return node;
}
