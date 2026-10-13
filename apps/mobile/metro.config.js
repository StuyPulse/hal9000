const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The website and native app intentionally use different React patch versions.
// Resolve React consistently from this app, including imports in hoisted libraries.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^react(?:\/|$)|^react-dom(?:\/|$)/.test(moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(moduleName, { paths: [__dirname] }) };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
