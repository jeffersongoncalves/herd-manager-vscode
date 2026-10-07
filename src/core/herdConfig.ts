/** herd.yml model. Only the top-level scalars the extension edits are parsed; the rest is rewritten with Herd's defaults. */
export interface HerdConfig {
  name: string;
  php: string;
  secured: boolean;
}

export const DEFAULT_PHP = '8.4';

export function parseHerdYml(content: string): HerdConfig {
  const values: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    // ponytail: top-level `key: scalar` only (no YAML lib); nested blocks are indented and skipped.
    const match = /^([A-Za-z_][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (match) {
      values[match[1]] = unquote(match[2].replace(/\s+#.*$/, ''));
    }
  }

  return {
    name: values.name ?? '',
    php: values.php || DEFAULT_PHP,
    secured: values.secured === undefined ? true : values.secured.toLowerCase() === 'true',
  };
}

export function toHerdYml(config: HerdConfig): string {
  return [
    `name: ${config.name}`,
    `php: '${config.php}'`,
    `secured: ${config.secured}`,
    'aliases: {}',
    'services: {}',
    'integrations:',
    '    forge: {}',
    '',
  ].join('\n');
}

/** Herd site name for a folder: lowercase, anything but [a-z0-9-] becomes `-`. */
export function siteNameFromFolder(folder: string): string {
  return folder.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export function defaultConfig(folder: string): HerdConfig {
  return { name: siteNameFromFolder(folder), php: DEFAULT_PHP, secured: true };
}

export function isValidSiteName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

export function siteUrl(config: HerdConfig, tld: string): string | undefined {
  if (!config.name) {
    return undefined;
  }
  return `${config.secured ? 'https' : 'http'}://${config.name}.${tld}`;
}

/** Sets APP_URL in a .env file's content; returns undefined when it is already up to date. */
export function withAppUrl(envContent: string, url: string): string | undefined {
  const line = `APP_URL=${url}`;
  const pattern = /^APP_URL=.*$/m;
  const current = pattern.exec(envContent);

  if (current?.[0] === line) {
    return undefined;
  }
  if (current) {
    return envContent.replace(pattern, line);
  }
  return envContent.replace(/\n+$/, '') + `\n${line}\n`;
}

function unquote(value: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}
