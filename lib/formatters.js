const chalk = require('chalk');
const { table } = require('table');

function formatJson(data) {
  return JSON.stringify(data, null, 2);
}

function formatTable(data, columns) {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No data to display';
  }

  // If columns not specified, use keys from first object
  if (!columns) {
    columns = Object.keys(data[0]);
  }

  // Create table data
  const tableData = [
    columns.map(col => chalk.bold.cyan(col))
  ];

  data.forEach(row => {
    const rowData = columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return chalk.gray('—');
      if (typeof value === 'boolean') return value ? chalk.green('✓') : chalk.red('✗');
      if (typeof value === 'number') return value.toLocaleString();
      return String(value);
    });
    tableData.push(rowData);
  });

  return table(tableData);
}

function formatKeyValue(data) {
  const output = [];
  
  Object.entries(data).forEach(([key, value]) => {
    const formattedKey = chalk.cyan(key + ':');
    let formattedValue;
    
    if (value === null || value === undefined) {
      formattedValue = chalk.gray('—');
    } else if (typeof value === 'boolean') {
      formattedValue = value ? chalk.green('Yes') : chalk.red('No');
    } else if (typeof value === 'number') {
      formattedValue = value.toLocaleString();
    } else if (typeof value === 'object') {
      formattedValue = '\n' + formatJson(value);
    } else {
      formattedValue = String(value);
    }
    
    output.push(`${formattedKey} ${formattedValue}`);
  });
  
  return output.join('\n');
}

function truncateString(str, maxLength = 60) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatPercentage(value, total) {
  const percentage = (value / total) * 100;
  const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
  return color(`${percentage.toFixed(1)}%`);
}

module.exports = {
  formatJson,
  formatTable,
  formatKeyValue,
  truncateString,
  formatDate,
  formatPercentage
};
