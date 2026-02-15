# Quick Start Guide

Get up and running with meta-cli in 5 minutes.

## Step 1: Install

```bash
npm install -g meta-cli
```

Or use it without installing:
```bash
npx meta-cli
```

## Step 2: Get Your Access Token

### For Facebook/Instagram:

1. Visit [Meta for Developers](https://developers.facebook.com/)
2. Go to **My Apps** → Select your app (or create one)
3. Navigate to **Tools** → **Graph API Explorer**
4. Click **Generate Access Token**
5. Select permissions you need (e.g., `pages_read_engagement`, `instagram_basic`)
6. Copy the token

### For WhatsApp Business:

1. Visit [Meta Business Suite](https://business.facebook.com/)
2. Select your **WhatsApp Business Account**
3. Go to **Settings** → **API Setup**
4. Generate a **Permanent Token**
5. Copy the token

## Step 3: Authenticate

```bash
# Paste your token when prompted
meta auth login --api facebook

# Or provide it directly
meta auth login --api facebook --token YOUR_TOKEN_HERE
```

## Step 4: Test It Out

```bash
# Get your profile
meta query me

# See what it returns
meta query me --fields id,name,email
```

## Step 5: Explore

```bash
# Get your Facebook pages
meta query pages

# Get Instagram media
meta query instagram-media --limit 10

# Check rate limits
meta limits check

# See all commands
meta --help
```

## Common First Commands

### See your authentication status
```bash
meta auth status
```

### Get app information
```bash
meta app info
```

### Make a custom query
```bash
meta query custom /me/photos --fields id,name,created_time
```

### Check if you're hitting rate limits
```bash
meta limits check
```

## Pro Tips

### 1. Use JSON output for scripting
```bash
meta query me --json | jq .name
```

### 2. Store multiple API tokens
```bash
meta auth login --api facebook
meta auth login --api instagram
meta auth login --api whatsapp
```

### 3. Set up app credentials for advanced features
```bash
meta auth app
# Enter your App ID and Secret when prompted
```

### 4. Save your tokens securely
meta-cli stores tokens in your system's config directory:
- macOS: `~/Library/Preferences/meta-cli-nodejs/`
- Linux: `~/.config/meta-cli-nodejs/`
- Windows: `%APPDATA%\meta-cli-nodejs\`

### 5. Use aliases for common commands
```bash
# Add to ~/.bashrc or ~/.zshrc
alias mq='meta query'
alias ml='meta limits check'
alias ma='meta auth status'
```

## Troubleshooting

### "No token found"
→ Run `meta auth login --api YOUR_API`

### "Token validation failed"
→ Your token might be expired. Generate a new one from Meta for Developers.

### "Rate limit exceeded"
→ You're making too many requests. Check with `meta limits check` and wait.

### "Command not found: meta"
→ Install globally: `npm install -g meta-cli`

## Next Steps

- Read the [full README](README.md) for all commands
- Check out [examples](EXAMPLES.md) for real-world usage
- Review [contributing guide](CONTRIBUTING.md) to add features

## Need Help?

- Run `meta --help` for command list
- Run `meta COMMAND --help` for command-specific help
- Open an issue on GitHub
- Check Meta's [Graph API documentation](https://developers.facebook.com/docs/graph-api/)

---

**You're ready to go!** Start querying Meta's APIs without the headache. 🚀
