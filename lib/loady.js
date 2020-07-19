/*!
 * loady.js - dynamic loader for node.js
 * Copyright (c) 2019, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/loady
 *
 * Parts of this software are based on TooTallNate/node-bindings:
 *   Copyright (c) 2012, Nathan Rajlich <nathan@tootallnate.net>
 *   https://github.com/TooTallNate/node-bindings
 */

/* global __webpack_require__, __non_webpack_require__ */
/* eslint camelcase: "off" */

'use strict';

const {dirname, extname, join, resolve} = require('path');
const {existsSync} = require('fs');

/*
 * Constants
 */

const defaults = {
  __proto__: null,
  root: '/',
  name: 'bindings.node',
  arch: process.arch,
  compiled: process.env.NODE_BINDINGS_COMPILED_DIR || 'compiled',
  pregyp:
    `node-v${process.versions.modules}-${process.platform}-${process.arch}`,
  platform: process.platform,
  version: process.versions.node
};

const paths = [
  // node-gyp's linked version in the "build" dir.
  ['$root', 'build', '$name'],
  // node-waf and gyp_addon (a.k.a node-gyp).
  ['$root', 'build', 'Debug', '$name'],
  ['$root', 'build', 'Release', '$name'],
  // Raw CMake (single-configuration, e.g. make).
  ['$root', '$name'],
  // Raw CMake (multi-configuration, e.g. msvs, xcode).
  ['$root', 'Debug', '$name'],
  ['$root', 'Release', '$name'],
  ['$root', 'MinSizeRel', '$name'],
  ['$root', 'RelWithDebInfo', '$name'],
  // Debug files, for development (legacy behavior).
  ['$root', 'out', 'Debug', '$name'],
  ['$root', 'Debug', '$name'],
  // Release files, but manually compiled (legacy behavior).
  ['$root', 'out', 'Release', '$name'],
  ['$root', 'Release', '$name'],
  // Legacy from node-waf, node <= 0.4.x.
  ['$root', 'build', 'default', '$name'],
  // Production "Release" buildtype binary (meh...).
  ['$root', '$compiled', '$version', '$platform', '$arch', '$name'],
  // node-qbs builds
  ['$root', 'addon-build', 'release', 'install-root', '$name'],
  ['$root', 'addon-build', 'debug', 'install-root', '$name'],
  ['$root', 'addon-build', 'default', 'install-root', '$name'],
  // node-pre-gyp path ./lib/binding/{node_abi}-{platform}-{arch}.
  ['$root', 'lib', 'binding', '$pregyp', '$name']
];

const cache = Object.create(null);

/**
 * Loady
 */

function loady(name, path) {
  if (typeof name !== 'string')
    throw new TypeError('"name" must be a string.');

  if (typeof path !== 'string')
    throw new TypeError('"path" must be a string.');

  if (extname(name) !== '.node')
    name += '.node';

  path = ensurePath(path);

  const key = `${name}\0${path}`;

  if (cache[key])
    return cache[key];

  const loader = typeof __webpack_require__ === 'function'
    ? __non_webpack_require__
    : require;

  const tries = [];
  const options = Object.create(defaults);

  options.root = getRoot(path);
  options.name = name;

  for (const parts of paths) {
    const names = [];

    for (const part of parts) {
      if (part[0] === '$')
        names.push(options[part.substring(1)]);
      else
        names.push(part);
    }

    const file = join(...names);

    tries.push(file);

    let binding = null;

    try {
      binding = loader(file);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND')
        continue;

      if (e.code === 'QUALIFIED_PATH_RESOLUTION_FAILED')
        continue;

      if (/not find/i.test(e.message))
        continue;

      throw e;
    }

    cache[key] = binding;

    return binding;
  }

  const msg = tries.map(file => ` - ${file}`).join('\n');
  const err = new Error(`Could not locate the bindings file. Tried:\n${msg}`);

  err.code = 'ERR_BINDINGS_NOT_FOUND';
  err.tries = tries;

  throw err;
}

function getRoot(path) {
  let root = resolve(path);

  for (;;) {
    if (existsSync(join(root, 'package.json'))
        || existsSync(join(root, 'node_modules'))) {
      break;
    }

    const next = dirname(root);

    if (next === root) {
      const err = new Error(`Could not find module root given file: "${path}". `
                          + 'Do you have a `package.json` file?');
      err.code = 'ERR_BINDINGS_NO_ROOT';
      err.path = path;
      throw err;
    }

    root = next;
  }

  return root;
}

function ensurePath(path) {
  if (path.indexOf('file:') === 0) {
    const {fileURLToPath} = require('url');

    if (!fileURLToPath) {
      const err = new Error('File URLs are unsupported on this platform.');
      err.code = 'ERR_BINDINGS_FILE_URI';
      err.url = path;
      throw err;
    }

    // Assume this is an import.meta.url.
    return dirname(fileURLToPath(path));
  }

  return path;
}

/*
 * Expose
 */

module.exports = loady;
