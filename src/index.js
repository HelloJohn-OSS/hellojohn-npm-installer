'use strict';

// Public API surface — useful when hellojohn-oss is required programmatically.
// Primary use case is the CLI entry point and the postinstall hook.

const { runSetup }      = require('./commands/setup');
const { runQuickstart } = require('./commands/quickstart');
const { runDoctor }     = require('./commands/doctor');
const { runUpdate }     = require('./commands/update');
const { runUninstall }  = require('./commands/uninstall');
const { proxyToHjctl }  = require('./lib/proxy');
const { detect }        = require('./lib/platform');
const { binDir }        = require('./lib/install-dir');

module.exports = {
  runSetup,
  runQuickstart,
  runDoctor,
  runUpdate,
  runUninstall,
  proxyToHjctl,
  detect,
  binDir,
};
