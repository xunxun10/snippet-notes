#!/usr/bin/env node

/**
 * Rebuild native modules for cross-platform builds
 * 只在平台不匹配时才进行交叉编译处理
 * Only handles cross-compilation when target platform != current platform
 */

const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const config = require('./config');

const args = process.argv.slice(2);
const targetPlatform = args[0] || 'current';

// 获取项目信息
const projectConfig = config.getProjectConfig();
const projectRoot = projectConfig.projectRoot;
const sqliteDir = path.join(projectRoot, 'node_modules/sqlite3');

// 映射平台标识符
const PLATFORM_MAP = {
  'win': { os: 'windows', arch: 'x64' },
  'win32': { os: 'windows', arch: 'x64' },
  'linux.x86': { os: 'linux', arch: 'x64' },
  'linux': { os: 'linux', arch: 'x64' },
  'arm': { os: 'linux', arch: 'arm64' },
  'current': { os: process.platform, arch: process.arch }
};

// 标准化平台 arch 标识
const normalizeArch = (arch) => arch === 'x64' ? 'x64' : arch === 'x32' ? 'x86' : arch;

// 检测当前平台
const currentOS = process.platform === 'darwin' ? 'macos' : process.platform;
const currentArch = normalizeArch(process.arch);
const currentPlatformStr = `${currentOS}-${currentArch}`;

// 获取目标平台信息
const targetInfo = PLATFORM_MAP[targetPlatform];
if (!targetInfo) {
  console.error(`[Native] Unknown target platform: ${targetPlatform}`);
  console.error(`[Native] Supported targets: ${Object.keys(PLATFORM_MAP).join(', ')}`);
  process.exit(1);
}

const targetPlatformStr = `${targetInfo.os}-${targetInfo.arch}`;

console.log(`[Native] Current platform:  ${currentPlatformStr}`);
console.log(`[Native] Target platform:   ${targetPlatformStr}`);

// 检查是否需要交叉编译
const needsCrossCompile = currentPlatformStr !== targetPlatformStr;

try {
  // 清理旧的编译产物
  if (fs.existsSync(path.join(sqliteDir, 'build'))) {
    console.log('[Native] Cleaning old build artifacts...');
    execSync(`rm -rf ${path.join(sqliteDir, 'build')}`, { stdio: 'inherit' });
  }

  if (!needsCrossCompile) {
    // 平台匹配：使用 npm rebuild，自动使用兼容的二进制或构建
    console.log('[Native] Platform match - using npm rebuild...');
    execSync('npm rebuild sqlite3', { 
      cwd: projectRoot,
      stdio: 'inherit' 
    });
  } else {
    // 平台不匹配：处理交叉编译
    console.log(`[Native] Platform mismatch - handling cross-compilation...`);
    
    // 清理不兼容的 binding
    const bindingDir = path.join(sqliteDir, 'lib/binding');
    if (fs.existsSync(bindingDir)) {
      console.log('[Native] Cleaning incompatible bindings...');
      execSync(`rm -rf ${bindingDir}`, { stdio: 'inherit' });
    }

    // 根据目标平台类型进行处理
    if (targetInfo.os === 'windows') {
      console.log('[Native] Windows target: cannot cross-compile C++ modules from Linux');
      console.log('[Native] Recommendation: Run Windows build on Windows machine');
      console.log('[Native] Or use: node scripts/download-sqlite3-win.js');
      // 不失败，但提示用户
    } else {
      // Linux targets: attempt rebuild with build-from-source
      console.log(`[Native] Attempting to rebuild for ${targetPlatformStr}...`);
      execSync('npm rebuild sqlite3 --build-from-source', { 
        cwd: projectRoot,
        stdio: 'inherit' 
      });
    }
  }

  console.log('[Native] Done!');
  process.exit(0);
} catch (error) {
  console.error('[Native] Error:', error.message);
  process.exit(1);
}
