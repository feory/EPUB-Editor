// Verbose operational logging — silent unless DEBUG=true.
export const debugLog = Bun.env.DEBUG === 'true'
  ? (...args) => console.log(...args)
  : () => {};
