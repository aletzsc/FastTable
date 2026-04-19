// Metro (RN 0.79+) habilita `package.json#exports` por defecto; con @supabase/realtime-js
// puede fallar la resolución de submódulos (p. ej. ./RealtimePresence).
// Ver: https://github.com/supabase/supabase-js/issues/1726
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

module.exports = config;
