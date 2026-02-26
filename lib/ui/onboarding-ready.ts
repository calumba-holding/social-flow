function nextActions() {
  return [
    { label: 'Start Gateway', command: 'social start' },
    { label: 'Check health', command: 'social status' },
    { label: 'Open Hatch UI', command: 'social hatch' }
  ];
}

function readyLines(input = {}) {
  const profile = String(input.profile || 'default').trim() || 'default';
  const actions = nextActions();
  const lines = [];
  lines.push('You are now ready.');
  lines.push(`Profile: ${profile}`);
  lines.push('Next 3 actions:');
  actions.forEach((row, idx) => {
    lines.push(`${idx + 1}. ${row.label}: ${row.command}`);
  });
  return lines;
}

module.exports = {
  nextActions,
  readyLines
};
