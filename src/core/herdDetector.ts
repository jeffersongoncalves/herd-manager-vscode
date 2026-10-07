import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Platform/home are injectable so the lookups can be tested on any OS. */
export interface Env {
  platform: NodeJS.Platform;
  home: string;
  pathEnv: string;
  exists: (p: string) => boolean;
  read: (p: string) => string;
  list: (dir: string) => string[];
}

export function nodeEnv(): Env {
  return {
    platform: process.platform,
    home: os.homedir(),
    pathEnv: process.env.PATH ?? '',
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.readFileSync(p, 'utf8'),
    list: (dir) => fs.readdirSync(dir),
  };
}

export const DEFAULT_PHP_VERSIONS = ['8.4', '8.3', '8.2', '8.1'];

export function herdExecutable(env: Env): string | undefined {
  const p = env.platform === 'win32' ? path.win32 : path.posix;
  const herdBin = p.join(env.home, '.config', 'herd', 'bin');

  const candidates =
    env.platform === 'win32'
      ? [p.join(herdBin, 'herd.bat'), p.join(herdBin, 'herd.exe')]
      : env.platform === 'darwin'
        ? ['/opt/homebrew/bin/herd', '/usr/local/bin/herd', p.join(env.home, 'Library', 'Application Support', 'Herd', 'bin', 'herd'), p.join(herdBin, 'herd')]
        : [p.join(herdBin, 'herd')];

  return candidates.find(env.exists) ?? findInPath(env, 'herd');
}

export function installedPhpVersions(env: Env): string[] {
  const file = firstExisting(env, [
    env.platform === 'darwin' ? join(env, env.home, 'Library', 'Application Support', 'Herd', 'config', 'php', 'php.json') : undefined,
    join(env, env.home, '.config', 'herd', 'config', 'php.json'),
  ]);
  if (!file) {
    return DEFAULT_PHP_VERSIONS;
  }

  try {
    const json = JSON.parse(env.read(file)) as Record<string, unknown>;
    const versions = Object.keys(json)
      .filter((k) => k.startsWith('installed_') && !k.startsWith('installed_internal_'))
      .map((k) => k.slice('installed_'.length))
      .filter((v) => /^\d+\.\d+$/.test(v))
      .sort((a, b) => compareVersions(b, a));
    return versions.length ? versions : DEFAULT_PHP_VERSIONS;
  } catch {
    return DEFAULT_PHP_VERSIONS;
  }
}

export function tld(env: Env): string {
  const file = firstExisting(env, valetCandidates(env, 'config.json'));
  if (!file) {
    return 'test';
  }
  try {
    const value = (JSON.parse(env.read(file)) as { tld?: unknown }).tld;
    return typeof value === 'string' && value ? value : 'test';
  } catch {
    return 'test';
  }
}

export function isSiteLinked(env: Env, siteName: string): boolean {
  const sites = firstExisting(env, valetCandidates(env, 'Sites'));
  return !!sites && !!siteName && env.exists(join(env, sites, siteName));
}

/** Strips PHP Deprecated/Warning/Notice lines and phar:// frames that herd.phar prints around real output. */
export function cleanOutput(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(Deprecated|Warning|Notice|Strict Standards|Deprecation):/i.test(l) && !l.includes('phar://'))
    .join('\n')
    .trim();
}

function valetCandidates(env: Env, leaf: string): (string | undefined)[] {
  return [
    env.platform === 'darwin' ? join(env, env.home, '.config', 'valet', leaf) : undefined,
    join(env, env.home, '.config', 'herd', 'config', 'valet', leaf),
  ];
}

function findInPath(env: Env, command: string): string | undefined {
  const win = env.platform === 'win32';
  const exts = win ? ['.bat', '.exe', '.cmd', ''] : [''];
  for (const dir of env.pathEnv.split(win ? ';' : ':').filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(env, dir, command + ext);
      if (env.exists(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function firstExisting(env: Env, candidates: (string | undefined)[]): string | undefined {
  return candidates.find((c): c is string => !!c && env.exists(c));
}

function join(env: Env, ...parts: string[]): string {
  return (env.platform === 'win32' ? path.win32 : path.posix).join(...parts);
}

function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor] = a.split('.').map(Number);
  const [bMajor, bMinor] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}
