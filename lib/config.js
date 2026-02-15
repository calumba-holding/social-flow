const fs = require('fs');
const os = require('os');
const path = require('path');
const chalk = require('chalk');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

class ConfigManager {
  constructor() {
    this.dir = path.join(os.homedir(), '.meta-cli');
    this.file = path.join(this.dir, 'config.json');
    this.data = null;
    this._load();
  }

  _defaults() {
    return {
      apiVersion: 'v20.0',
      defaultApi: 'facebook',
      agent: {
        provider: 'openai',
        model: '',
        apiKey: ''
      },
      tokens: {
        facebook: '',
        instagram: '',
        whatsapp: ''
      },
      app: {
        id: '',
        secret: ''
      },
      defaults: {
        facebookPageId: '',
        igUserId: '',
        whatsappPhoneNumberId: '',
        marketingAdAccountId: ''
      }
    };
  }

  _load() {
    ensureDir(this.dir);
    const existing = readJson(this.file);
    if (existing) {
      // Shallow merge defaults to keep forward-compat.
      const d = this._defaults();
      this.data = {
        ...d,
        ...existing,
        agent: { ...d.agent, ...(existing.agent || {}) },
        tokens: { ...d.tokens, ...(existing.tokens || {}) },
        app: { ...d.app, ...(existing.app || {}) },
        defaults: { ...d.defaults, ...(existing.defaults || {}) }
      };
      return;
    }

    this.data = this._defaults();
    writeJsonAtomic(this.file, this.data);
  }

  _save() {
    writeJsonAtomic(this.file, this.data);
  }

  // Paths
  getConfigPath() {
    return this.file;
  }

  // API version
  setApiVersion(apiVersion) {
    this.data.apiVersion = apiVersion;
    this._save();
  }

  getApiVersion() {
    return this.data.apiVersion || 'v20.0';
  }

  // Tokens
  setToken(api, token) {
    this.data.tokens = this.data.tokens || {};
    this.data.tokens[api] = token;
    this._save();
  }

  getToken(api) {
    return (this.data.tokens || {})[api] || '';
  }

  hasToken(api) {
    return Boolean(this.getToken(api));
  }

  removeToken(api) {
    this.data.tokens = this.data.tokens || {};
    delete this.data.tokens[api];
    this._save();
  }

  clearAllTokens() {
    this.data.tokens = {};
    this._save();
  }

  // App credentials
  setAppCredentials(appId, appSecret) {
    this.data.app = { id: appId || '', secret: appSecret || '' };
    this._save();
  }

  getAppCredentials() {
    return {
      appId: (this.data.app || {}).id || '',
      appSecret: (this.data.app || {}).secret || ''
    };
  }

  hasAppCredentials() {
    const { appId, appSecret } = this.getAppCredentials();
    return Boolean(appId && appSecret);
  }

  // Default API
  setDefaultApi(api) {
    this.data.defaultApi = api;
    this._save();
  }

  getDefaultApi() {
    return this.data.defaultApi || 'facebook';
  }

  // Defaults: Facebook Page / IG user / WhatsApp phone
  setDefaultFacebookPageId(pageId) {
    this.data.defaults = this.data.defaults || {};
    this.data.defaults.facebookPageId = pageId || '';
    this._save();
  }

  getDefaultFacebookPageId() {
    return (this.data.defaults || {}).facebookPageId || '';
  }

  setDefaultIgUserId(igUserId) {
    this.data.defaults = this.data.defaults || {};
    this.data.defaults.igUserId = igUserId || '';
    this._save();
  }

  getDefaultIgUserId() {
    return (this.data.defaults || {}).igUserId || '';
  }

  setDefaultWhatsAppPhoneNumberId(phoneNumberId) {
    this.data.defaults = this.data.defaults || {};
    this.data.defaults.whatsappPhoneNumberId = phoneNumberId || '';
    this._save();
  }

  getDefaultWhatsAppPhoneNumberId() {
    return (this.data.defaults || {}).whatsappPhoneNumberId || '';
  }

  // Defaults: Marketing ad account
  setDefaultMarketingAdAccountId(adAccountId) {
    this.data.defaults = this.data.defaults || {};
    this.data.defaults.marketingAdAccountId = adAccountId || '';
    this._save();
  }

  getDefaultMarketingAdAccountId() {
    return (this.data.defaults || {}).marketingAdAccountId || '';
  }

  // Agent config (LLM provider/key/model). WARNING: apiKey is sensitive.
  getAgentConfig() {
    return { ...(this.data.agent || {}) };
  }

  setAgentProvider(provider) {
    this.data.agent = this.data.agent || {};
    this.data.agent.provider = provider || 'openai';
    this._save();
  }

  setAgentModel(model) {
    this.data.agent = this.data.agent || {};
    this.data.agent.model = model || '';
    this._save();
  }

  setAgentApiKey(apiKey) {
    this.data.agent = this.data.agent || {};
    this.data.agent.apiKey = apiKey || '';
    this._save();
  }

  // Display (sanitized)
  display() {
    const tokens = this.data.tokens || {};
    const { appId, appSecret } = this.getAppCredentials();
    const defaultApi = this.getDefaultApi();
    const apiVersion = this.getApiVersion();
    const agentCfg = this.getAgentConfig();

    console.log(chalk.bold('\nCurrent Configuration:'));
    console.log(chalk.gray('Config file: ' + this.getConfigPath()));
    console.log('');

    console.log(chalk.bold('Tokens:'));
    ['facebook', 'instagram', 'whatsapp'].forEach((api) => {
      const token = tokens[api];
      if (token) {
        const masked = token.substring(0, 6) + '...' + token.substring(token.length - 4);
        console.log(`  ${api}: ${chalk.green(masked)}`);
      } else {
        console.log(`  ${api}: ${chalk.red('not set')}`);
      }
    });

    console.log('');
    console.log(chalk.bold('App Credentials:'));
    console.log(`  App ID: ${appId ? chalk.green(appId) : chalk.red('not set')}`);
    console.log(`  App Secret: ${appSecret ? chalk.green('***configured***') : chalk.red('not set')}`);

    console.log('');
    console.log(chalk.bold('Settings:'));
    console.log(`  API Version: ${chalk.cyan(apiVersion)}`);
    console.log(`  Default API: ${chalk.cyan(defaultApi)}`);
    console.log(`  Agent Provider: ${chalk.cyan(agentCfg.provider || 'openai')}`);
    console.log(`  Agent Model: ${chalk.cyan(agentCfg.model || '(default)')}`);
    console.log(`  Agent API Key: ${agentCfg.apiKey ? chalk.green('***configured***') : chalk.gray('not set')}`);

    console.log('');
    console.log(chalk.bold('Defaults:'));
    console.log(`  Default Facebook Page: ${this.getDefaultFacebookPageId() ? chalk.cyan(this.getDefaultFacebookPageId()) : chalk.gray('not set')}`);
    console.log(`  Default IG User: ${this.getDefaultIgUserId() ? chalk.cyan(this.getDefaultIgUserId()) : chalk.gray('not set')}`);
    console.log(`  Default WhatsApp Phone: ${this.getDefaultWhatsAppPhoneNumberId() ? chalk.cyan(this.getDefaultWhatsAppPhoneNumberId()) : chalk.gray('not set')}`);
    console.log(`  Default Ad Account: ${this.getDefaultMarketingAdAccountId() ? chalk.cyan(this.getDefaultMarketingAdAccountId()) : chalk.gray('not set')}`);
    console.log('');
  }
}

module.exports = new ConfigManager();
