import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { HerdConfig, defaultConfig, parseHerdYml, siteUrl, toHerdYml, withAppUrl } from './core/herdConfig';
import { Env, cleanOutput, herdExecutable, installedPhpVersions, isSiteLinked, nodeEnv, tld } from './core/herdDetector';

export interface HerdState {
  executable?: string;
  root?: string;
  folderName: string;
  config?: HerdConfig;
  linked: boolean;
  tld: string;
  url?: string;
}

const env: Env = nodeEnv();

export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function readState(): HerdState {
  const root = workspaceRoot();
  const executable = herdExecutable(env);
  const topLevel = tld(env);
  const ymlPath = root ? path.join(root, 'herd.yml') : undefined;

  let config: HerdConfig | undefined;
  if (ymlPath && fs.existsSync(ymlPath)) {
    try {
      config = parseHerdYml(fs.readFileSync(ymlPath, 'utf8'));
    } catch {
      config = undefined;
    }
  }

  return {
    executable,
    root,
    folderName: root ? path.basename(root) : '',
    config,
    linked: !!config?.name && isSiteLinked(env, config.name),
    tld: topLevel,
    url: config ? siteUrl(config, topLevel) : undefined,
  };
}

export function phpVersions(): string[] {
  return installedPhpVersions(env);
}

export function configOrDefault(state: HerdState): HerdConfig {
  return state.config ?? defaultConfig(state.folderName);
}

/** Writes herd.yml and keeps .env APP_URL in sync, like the JetBrains plugin. */
export function saveConfig(state: HerdState, config: HerdConfig): void {
  if (!state.root) {
    throw new Error('Open a folder first.');
  }
  fs.writeFileSync(path.join(state.root, 'herd.yml'), toHerdYml(config), 'utf8');

  const envFile = path.join(state.root, '.env');
  const url = siteUrl(config, state.tld);
  if (url && fs.existsSync(envFile)) {
    const updated = withAppUrl(fs.readFileSync(envFile, 'utf8'), url);
    if (updated !== undefined) {
      fs.writeFileSync(envFile, updated, 'utf8');
    }
  }
}

/** Runs `herd <args>` in the workspace root; resolves with the cleaned output, rejects with the cleaned error. */
export function runHerd(state: HerdState, args: string[]): Promise<string> {
  const exe = state.executable;
  if (!exe) {
    return Promise.reject(new Error('Herd executable not found.'));
  }

  const options = { cwd: state.root, timeout: 30_000, windowsHide: true };

  return new Promise((resolve, reject) => {
    const done = (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error(cleanOutput(stderr) || cleanOutput(stdout) || error.message));
      } else {
        resolve(cleanOutput(stdout) || 'Command completed successfully');
      }
    };

    if (/\.(bat|cmd)$/i.test(exe)) {
      // .bat/.cmd only run through cmd.exe; args are validated site names/domains, so plain joining is safe.
      exec(`"${exe}" ${args.join(' ')}`, options, done);
    } else {
      execFile(exe, args, options, done);
    }
  });
}
