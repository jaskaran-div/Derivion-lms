// Test helpers: swap modules in Node's require cache and fake Express responses
const Module = require('node:module');

const installMockModule = (modulePath, exportsValue) => {
  const mockModule = new Module(modulePath);
  mockModule.filename = modulePath;
  mockModule.loaded = true;
  mockModule.exports = exportsValue;
  require.cache[modulePath] = mockModule;
};

const response = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  cookies: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  cookie(name, value) { this.cookies[name] = value; return this; },
  clearCookie(name) { delete this.cookies[name]; return this; },
  setHeader(k, v) { this.headers[k] = v; },
});

module.exports = { installMockModule, response };
