# Contributing to meta-cli

Thanks for considering contributing. This tool is built to make Meta API workflows clearer and faster, and we welcome improvements.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/meta-cli.git`
3. Install dependencies: `npm install`
4. Make the CLI available locally: `npm link`

## Development Workflow

### Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test locally: `meta your-command`
4. Commit with clear messages: `git commit -m "Add feature: description"`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request

### Project Structure

```
meta-cli/
├── bin/
│   └── meta.js          # CLI entry point
├── commands/
│   ├── auth.js          # Authentication commands
│   ├── query.js         # Query commands
│   ├── app.js           # App management commands
│   └── limits.js        # Rate limit commands
├── lib/
│   ├── config.js        # Configuration manager
│   ├── api-client.js    # Meta API client
│   └── formatters.js    # Output formatters
└── package.json
```

### Adding a New Command

1. Create command file in `commands/` directory
2. Export a function that registers commands with commander
3. Import and register in `bin/meta.js`

Example:

```javascript
// commands/mycommand.js
function registerMyCommands(program) {
  const myCmd = program.command('mycmd').description('My command');
  
  myCmd
    .command('do-something')
    .description('Does something cool')
    .action(async (options) => {
      // Implementation
    });
}

module.exports = registerMyCommands;
```

### Adding API Methods

Add new API methods to `lib/api-client.js`:

```javascript
async myNewMethod(param) {
  return this.get('/endpoint', { param });
}
```

## Code Style

- Use 2 spaces for indentation
- Use async/await for asynchronous code
- Use chalk for colored output
- Use ora for loading spinners
- Handle errors gracefully with helpful messages

## Testing

Before submitting:

1. Test all commands you've modified
2. Verify error handling works
3. Check that help text is clear
4. Test with different APIs (Facebook, Instagram, WhatsApp)

## Pull Request Guidelines

### Good PR titles:
- `Add: WhatsApp message sending command`
- `Fix: Token validation for Instagram`
- `Improve: Error messages for rate limits`
- `Docs: Update README with new examples`

### PR Checklist:
- [ ] Code follows project style
- [ ] All commands tested locally
- [ ] README updated if needed
- [ ] No breaking changes (or clearly documented)
- [ ] Error messages are helpful
- [ ] Help text is clear

## Feature Ideas

Looking for something to work on? Here are some ideas:

### High Priority
- [ ] Batch request support
- [ ] Better Instagram Business API support
- [ ] WhatsApp template message sending
- [ ] Export/import configuration
- [ ] Interactive mode for exploring APIs

### Medium Priority
- [ ] Facebook Ads API integration
- [ ] Webhook testing/simulation
- [ ] Response caching
- [ ] Request history
- [ ] Configuration profiles (dev/staging/prod)

### Nice to Have
- [ ] Auto-complete for commands
- [ ] Progress bars for bulk operations
- [ ] Data visualization in terminal
- [ ] Plugin system
- [ ] Configuration wizard

## Questions?

Open an issue or discussion on GitHub!

## Philosophy

When contributing, remember:

1. **Clarity over hype** - Describe real behavior, constraints, and tradeoffs precisely
2. **Practicality over perfection** - A useful feature now beats a perfect feature later
3. **Clarity over brevity** - Error messages should help, not confuse
4. **Users over features** - Focus on what developers actually need

---

**Thanks for contributing to meta-cli by Chaos Craft Labs.**
