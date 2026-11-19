// Keep the background host independent of all renderer/browser lifecycle imports.
if (process.argv.includes('--bot-host')) void import('./bot-host-entry');
else void import('./main');
