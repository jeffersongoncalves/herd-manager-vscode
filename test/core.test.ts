import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { defaultConfig, isValidSiteName, parseHerdYml, siteUrl, toHerdYml, withAppUrl } from '../src/core/herdConfig';
import { Env, cleanOutput, herdExecutable, installedPhpVersions, isSiteLinked, tld } from '../src/core/herdDetector';

function fakeEnv(platform: NodeJS.Platform, files: Record<string, string>, pathEnv = ''): Env {
  const norm = (p: string) => p.replace(/\\/g, '/');
  const all = Object.fromEntries(Object.entries(files).map(([k, v]) => [norm(k), v]));
  return {
    platform,
    home: platform === 'win32' ? 'C:\\Users\\dev' : '/home/dev',
    pathEnv,
    exists: (p) => norm(p) in all || Object.keys(all).some((k) => k.startsWith(norm(p) + '/')),
    read: (p) => all[norm(p)],
    list: () => [],
  };
}

describe('herd.yml', () => {
  it('round-trips the edited fields', () => {
    const config = { name: 'my-app', php: '8.3', secured: false };
    assert.deepEqual(parseHerdYml(toHerdYml(config)), config);
  });

  it('reads quoted values, comments and defaults', () => {
    assert.deepEqual(parseHerdYml("name: \"shop\" # site\nphp: '8.2'\naliases: {}\nintegrations:\n    forge: {}\n"), {
      name: 'shop',
      php: '8.2',
      secured: true,
    });
    assert.deepEqual(parseHerdYml(''), { name: '', php: '8.4', secured: true });
  });

  it('derives a valid site name from the folder', () => {
    assert.equal(defaultConfig('My App_v2').name, 'my-app-v2');
    assert.ok(isValidSiteName('my-app-v2'));
    assert.ok(!isValidSiteName('my app; rm -rf'));
    assert.ok(!isValidSiteName('-app'));
  });

  it('builds the site URL', () => {
    assert.equal(siteUrl({ name: 'app', php: '8.4', secured: true }, 'test'), 'https://app.test');
    assert.equal(siteUrl({ name: 'app', php: '8.4', secured: false }, 'local'), 'http://app.local');
    assert.equal(siteUrl({ name: '', php: '8.4', secured: true }, 'test'), undefined);
  });

  it('updates or appends APP_URL in .env', () => {
    assert.equal(withAppUrl('APP_NAME=x\nAPP_URL=http://localhost\n', 'https://app.test'), 'APP_NAME=x\nAPP_URL=https://app.test\n');
    assert.equal(withAppUrl('APP_NAME=x\n\n', 'https://app.test'), 'APP_NAME=x\nAPP_URL=https://app.test\n');
    assert.equal(withAppUrl('APP_URL=https://app.test\n', 'https://app.test'), undefined);
  });
});

describe('Herd detection', () => {
  it('finds herd.bat on Windows, then falls back to PATH', () => {
    assert.equal(herdExecutable(fakeEnv('win32', { 'C:\\Users\\dev\\.config\\herd\\bin\\herd.bat': '' })), 'C:\\Users\\dev\\.config\\herd\\bin\\herd.bat');
    assert.equal(herdExecutable(fakeEnv('linux', { '/usr/bin/herd': '' }, '/bin:/usr/bin')), '/usr/bin/herd');
    assert.equal(herdExecutable(fakeEnv('linux', {})), undefined);
  });

  it('lists installed PHP versions newest first, ignoring internal ones', () => {
    const env = fakeEnv('win32', {
      'C:\\Users\\dev\\.config\\herd\\config\\php.json': JSON.stringify({ installed_8_x: true, 'installed_8.2': true, 'installed_8.10': true, 'installed_internal_8.4': true, 'installed_7.4': true }),
    });
    assert.deepEqual(installedPhpVersions(env), ['8.10', '8.2', '7.4']);
    assert.deepEqual(installedPhpVersions(fakeEnv('win32', {})), ['8.4', '8.3', '8.2', '8.1']);
  });

  it('reads the TLD and link status from the valet config', () => {
    const env = fakeEnv('darwin', {
      '/home/dev/.config/valet/config.json': '{"tld":"local"}',
      '/home/dev/.config/valet/Sites/app': '',
    });
    assert.equal(tld(env), 'local');
    assert.ok(isSiteLinked(env, 'app'));
    assert.ok(!isSiteLinked(env, 'other'));
    assert.equal(tld(fakeEnv('linux', {})), 'test');
  });

  it('strips PHP noise from CLI output', () => {
    assert.equal(cleanOutput('Deprecated: foo in phar://herd.phar/x\nA [app] symbolic link has been created\n\n'), 'A [app] symbolic link has been created');
  });
});
