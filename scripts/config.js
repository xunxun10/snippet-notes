#!/usr/bin/env node

/**
 * Build configuration - 动态读取 package.json 中的版本信息
 * 所有脚本都应该使用这个模块来获取配置，而不是硬编码版本号
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');

let packageData = null;

function loadPackageJson() {
  if (packageData) return packageData;
  
  const content = fs.readFileSync(PACKAGE_JSON, 'utf8');
  packageData = JSON.parse(content);
  return packageData;
}

/**
 * 获取项目配置
 */
function getProjectConfig() {
  const pkg = loadPackageJson();
  return {
    name: pkg.name,
    version: pkg.version,
    projectRoot: PROJECT_ROOT
  };
}

/**
 * 获取依赖版本
 * @param {string} depName - 依赖名称 (如 'sqlite3', 'electron')
 */
function getDependencyVersion(depName) {
  const pkg = loadPackageJson();
  
  // 先查找 dependencies
  if (pkg.dependencies && pkg.dependencies[depName]) {
    return pkg.dependencies[depName].replace(/[\^~>=<]/, '');
  }
  
  // 再查找 devDependencies
  if (pkg.devDependencies && pkg.devDependencies[depName]) {
    return pkg.devDependencies[depName].replace(/[\^~>=<]/, '');
  }
  
  throw new Error(`Dependency "${depName}" not found in package.json`);
}

/**
 * 获取原生模块配置
 */
function getNativeModuleConfig(moduleName) {
  const version = getDependencyVersion(moduleName);
  
  // 定义不同模块的配置
  const configs = {
    sqlite3: {
      version,
      napiVersion: 'napi-v6',
      platforms: {
        'win32-x64': 'win32-x64',
        'linux-x64': 'linux-glibc-x64',
        'linux-arm64': 'linux-glibc-arm64'
      }
    }
  };
  
  if (!configs[moduleName]) {
    throw new Error(`No config found for module "${moduleName}"`);
  }
  
  return configs[moduleName];
}

/**
 * 获取编译目标配置
 */
function getBuildTargets() {
  return {
    win: {
      name: 'win',
      desc: 'Windows x64',
      platform: 'win32',
      arch: 'x64',
      npmScript: 'dist',
      buildDir: 'win-unpacked',
      outputPrefix: (name, version) => `${name}-win32-x64`
    },
    'linux.x86': {
      name: 'linux.x86',
      desc: 'Linux x86',
      platform: 'linux',
      arch: 'x64',
      npmScript: 'linux.x86',
      buildDir: 'linux-unpacked',
      outputPrefix: (name, version) => `${name}-linux-x86`
    },
    arm: {
      name: 'arm',
      desc: 'Linux ARM64',
      platform: 'linux',
      arch: 'arm64',
      npmScript: 'arm',
      buildDir: 'linux-arm64-unpacked',
      outputPrefix: (name, version) => `${name}-linux-arm64`,
      needsSplit: true  // 需要分割打包
    }
  };
}

/**
 * 获取构建目标的输出名称
 */
function getOutputName(targetName, nameOverride = null) {
  const pkg = loadPackageJson();
  const name = nameOverride || pkg.name;
  const version = pkg.version;
  const target = getBuildTargets()[targetName];
  
  if (!target) {
    throw new Error(`Unknown target: ${targetName}`);
  }
  
  return target.outputPrefix(name, version);
}

module.exports = {
  getProjectConfig,
  getDependencyVersion,
  getNativeModuleConfig,
  getBuildTargets,
  getOutputName,
  loadPackageJson
};
