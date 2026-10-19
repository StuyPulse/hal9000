const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Vendored security backport is outside the monorepo's workspace globs.
config.watchFolders = [...config.watchFolders, require('path').resolve(__dirname, '../../vendor')];
// The website and native app intentionally use different React patch versions.
// Resolve React consistently from this app, including imports in hoisted libraries.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // SDK 57's query-string needs CommonJS; upstream's security fix is ESM-only.
  // Resolve every native/web bundle import to the licensed 0.5.0 CJS backport.
  if (moduleName === 'decode-uri-component') {
    return { type: 'sourceFile', filePath: require.resolve('../../vendor/decode-uri-component/index.cjs') };
  }
  if (/^react(?:\/|$)|^react-dom(?:\/|$)/.test(moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(moduleName, { paths: [__dirname] }) };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
