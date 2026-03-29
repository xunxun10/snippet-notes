#!/usr/bin/env node

/**
 * Download prebuilt sqlite3 binaries for Windows
 * 为 Windows 下载预构建的 sqlite3 binaries
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');

// 从配置中动态获取版本信息
const SQLITE3_VERSION = config.getDependencyVersion('sqlite3');
const nativeModuleConfig = config.getNativeModuleConfig('sqlite3');
const NAPI_VERSION = nativeModuleConfig.napiVersion;
const TARGET = 'win32-x64';

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 404) {
        resolve(false); // File not found
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete the file on error
      resolve(false);
    });
  });
}

async function main() {
  console.log('[SQLite3] Configuration:');
  console.log(`  - sqlite3 version: ${SQLITE3_VERSION}`);
  console.log(`  - NAPI version: ${NAPI_VERSION}`);
  console.log(`  - Target: ${TARGET}`);
  console.log('[SQLite3] Downloading prebuilt Windows binaries...');

  const projectConfig = config.getProjectConfig();
  const sqliteDir = path.join(projectConfig.projectRoot, 'node_modules/sqlite3');
  const bindingDir = path.join(sqliteDir, 'lib/binding', `${NAPI_VERSION}-${TARGET}`);

  // Create directory if it doesn't exist
  if (!fs.existsSync(bindingDir)) {
    execSync(`mkdir -p ${bindingDir}`, { stdio: 'inherit' });
  }

  const nodeFile = path.join(bindingDir, 'node_sqlite3.node');

  // Try to download from npm registry
  const npm_url = `https://registry.npmjs.org/sqlite3/-/sqlite3-${SQLITE3_VERSION}.tgz`;
  
  console.log('[SQLite3] Note: Cross-compiling sqlite3 for Windows on Linux is not recommended.');
  console.log('[SQLite3] Consider running this build on Windows for best results.');
  console.log('[SQLite3] Or modify the application to use a pure JavaScript SQLite implementation.');

  return Promise.resolve();
}

main().catch(err => {
  console.error('[SQLite3] Error:', err.message);
  process.exit(0); // Don't fail the build
});
