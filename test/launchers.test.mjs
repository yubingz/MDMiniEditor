// Packaging tests for the Windows launcher scripts.
//
// The launchers are how nearly every user starts the reader, and they only work when they
// arrive on disk with CRLF endings: cmd.exe splits LF-only batch files at the wrong
// boundaries, so every line turns into "'xxx' is not recognized as an internal or external
// command" and nothing ever opens. That invariant can only be asserted from a Linux
// checkout because .gitattributes maps these file types to eol=crlf — so these tests fail
// if either the scripts or the attribute rules regress.
//
// Run:  node --test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS_SCRIPT = /\.(bat|cmd|ps1)$/i;

const scripts = readdirSync(ROOT)
  .filter((name) => WINDOWS_SCRIPT.test(name))
  .sort();

// `latin1` maps bytes to code points one-to-one, so nothing is normalised on read the way
// utf8 would normalise it.
const readBytes = (name) => readFileSync(join(ROOT, name), 'latin1');

test('every Windows launcher script is covered', () => {
  assert.deepEqual(scripts, [
    'Open-Editor.bat',
    'Open-MD-File.bat',
    'install-file-association.ps1',
    'open-md-launch.ps1',
    'open-md.ps1',
  ]);
});

for (const script of scripts) {
  test(`${script} uses CRLF line endings`, () => {
    const text = readBytes(script);
    assert.ok(text.includes('\r\n'), `${script} has no CRLF line ending at all`);

    const bareLf = text.split('\r\n').join('').match(/\n/g) ?? [];
    assert.equal(
      bareLf.length,
      0,
      `${script} has ${bareLf.length} LF-only line ending(s); cmd.exe needs CRLF`
    );
  });
}

test('.gitattributes declares CRLF for each launcher file type', () => {
  const attributes = readFileSync(join(ROOT, '.gitattributes'), 'utf8');
  const extensions = [...new Set(scripts.map((name) => name.split('.').pop().toLowerCase()))];

  assert.ok(extensions.length > 0, 'no launcher scripts found to derive file types from');
  for (const extension of extensions) {
    assert.match(
      attributes,
      new RegExp(`^\\*\\.${extension}\\s+text\\s+eol=crlf\\s*$`, 'm'),
      `.gitattributes is missing a CRLF rule for *.${extension}`
    );
  }
});
