const axios = require('axios');
const chalk = require('chalk');

class MetaAPIClient {
  constructor(token, api = 'facebook') {
    this.token = token;
    this.api = api;
    this.baseUrls = {
      facebook: 'https://graph.facebook.com/v18.0',
      instagram: 'https://graph.facebook.com/v18.0',
      whatsapp: 'https://graph.facebook.com/v18.0'
    };
    this.baseUrl = this.baseUrls[api];
  }

  async request(method, endpoint, data = null, params = {}) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const config = {
        method,
        url,
        params: {
          access_token: this.token,
          ...params
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  async get(endpoint, params = {}) {
    return this.request('GET', endpoint, null, params);
  }

  async post(endpoint, data = {}, params = {}) {
    return this.request('POST', endpoint, data, params);
  }

  async delete(endpoint, params = {}) {
    return this.request('DELETE', endpoint, null, params);
  }

  // Common API calls
  async getMe(fields = 'id,name,email') {
    return this.get('/me', { fields });
  }

  async getAppInfo(appId) {
    return this.get(`/${appId}`, {
      fields: 'id,name,namespace,category,link,icon_url,logo_url,daily_active_users,weekly_active_users,monthly_active_users'
    });
  }

  async debugToken(tokenToDebug) {
    return this.get('/debug_token', {
      input_token: tokenToDebug
    });
  }

  async getRateLimits(appId) {
    // This is a simplified version - actual rate limits are returned in headers
    return this.get(`/${appId}`, {
      fields: 'rate_limit_info'
    });
  }

  // Facebook-specific
  async getFacebookPages() {
    return this.get('/me/accounts', {
      fields: 'id,name,access_token,category,fan_count'
    });
  }

  async postToPage(pageId, message) {
    return this.post(`/${pageId}/feed`, { message });
  }

  // Instagram-specific
  async getInstagramAccount() {
    return this.get('/me', {
      fields: 'id,username,account_type,media_count'
    });
  }

  async getInstagramMedia(userId, limit = 10) {
    return this.get(`/${userId}/media`, {
      fields: 'id,caption,media_type,media_url,permalink,timestamp',
      limit
    });
  }

  // WhatsApp-specific
  async getWhatsAppBusinessAccount(businessId) {
    return this.get(`/${businessId}`, {
      fields: 'id,name,timezone,message_template_namespace'
    });
  }

  async sendWhatsAppMessage(phoneNumberId, to, message) {
    return this.post(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    });
  }

  // Generic query for any endpoint
  async customQuery(endpoint, params = {}) {
    return this.get(endpoint, params);
  }

  handleError(error) {
    if (error.response) {
      const { data, status } = error.response;
      const message = data.error?.message || 'Unknown error';
      const code = data.error?.code || status;
      const type = data.error?.type || 'API Error';

      console.error(chalk.red('\n✖ Meta API Error:'));
      console.error(chalk.yellow(`  Type: ${type}`));
      console.error(chalk.yellow(`  Code: ${code}`));
      console.error(chalk.yellow(`  Message: ${message}`));
      
      if (data.error?.error_user_title) {
        console.error(chalk.yellow(`  Title: ${data.error.error_user_title}`));
      }
      
      if (data.error?.error_user_msg) {
        console.error(chalk.yellow(`  Details: ${data.error.error_user_msg}`));
      }

      // Helpful hints for common errors
      if (code === 190) {
        console.error(chalk.cyan('\n  💡 Hint: Your access token may be invalid or expired.'));
        console.error(chalk.cyan('     Try running: meta auth login'));
      } else if (code === 613) {
        console.error(chalk.cyan('\n  💡 Hint: Rate limit exceeded. Wait a bit and try again.'));
      } else if (status === 404) {
        console.error(chalk.cyan('\n  💡 Hint: The endpoint or resource doesn\'t exist.'));
      }

      console.error('');
      process.exit(1);
    } else if (error.request) {
      console.error(chalk.red('\n✖ Network Error: No response from Meta API'));
      console.error(chalk.yellow('  Check your internet connection\n'));
      process.exit(1);
    } else {
      console.error(chalk.red('\n✖ Error: ' + error.message + '\n'));
      process.exit(1);
    }
  }
}

module.exports = MetaAPIClient;
