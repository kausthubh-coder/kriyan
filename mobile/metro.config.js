const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the convex folder for changes
config.watchFolders = [workspaceRoot];

// Allow importing from the convex/ folder at workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure convex folder is resolved correctly
config.resolver.extraNodeModules = {
  '@convex': path.resolve(workspaceRoot, 'convex'),
  '@kriyan/client-core': path.resolve(workspaceRoot, 'packages/client-core/src'),
};

module.exports = config;
