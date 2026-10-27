// Express 4 never routes a rejected promise from an async handler to the
// error middleware: the request hangs forever and, in Node 15+, the rejection
// is unhandled and kills the whole process. One crashed route then takes the
// entire marketplace down for everyone (this is exactly how a bad issue upload
// could). Wrapping Layer#handle_request turns that into a normal error
// response for every route, existing and future, without touching each one.
const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__asyncSafe) {
  const original = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const handler = this.handle;
    if (handler.length > 3) return next();
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
    return undefined;
  };
  Layer.prototype.__asyncSafe = original;
}

// Last-resort net for rejections that happen outside a request (timers,
// fire-and-forget work). Log and keep serving; the API is one machine with
// all the data on it, so staying up beats a restart loop.
function installProcessSafetyNet() {
  process.on('unhandledRejection', reason => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
  });
  process.on('uncaughtException', err => {
    console.error('[uncaughtException]', err.stack || err);
  });
}

module.exports = { installProcessSafetyNet };
