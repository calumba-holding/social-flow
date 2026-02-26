const assert = require('node:assert/strict');
const { stripAnsi, renderPanel, formatTokenPreview } = require('../lib/ui/chrome');

module.exports = [
  {
    name: 'ui chrome renderPanel keeps frame widths aligned',
    fn: () => {
      const output = renderPanel({
        title: 'Panel',
        rows: ['alpha', 'beta'],
        minWidth: 16,
        borderColor: (value) => value
      });
      const lines = output.split('\n').map((line) => stripAnsi(line));
      const widths = Array.from(new Set(lines.map((line) => line.length)));

      assert.equal(widths.length, 1);
      assert.equal(lines[0].startsWith('┌'), true);
      assert.equal(lines[lines.length - 1].startsWith('└'), true);
    }
  },
  {
    name: 'ui chrome formatTokenPreview masks long tokens',
    fn: () => {
      const masked = formatTokenPreview('EAAB0123456789TOKENVALUE');
      assert.equal(masked, 'EAAB01...ALUE');
      assert.equal(formatTokenPreview('shorttoken'), 'shorttoken');
      assert.equal(formatTokenPreview(''), '');
    }
  }
];
