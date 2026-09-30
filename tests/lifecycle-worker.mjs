// IPC lets Windows exercise the real Node signal handlers without force-killing
// the child. Linux platform signal delivery remains a future hosted smoke check.
process.on('message', signal => {
  if (signal === 'SIGTERM' || signal === 'SIGINT') process.emit(signal);
});
await import(process.env.MATCH3_COMPILED === '1' ? '../dist/server.js' : '../src/server.ts');
