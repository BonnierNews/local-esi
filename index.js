"use strict";

const transformHtml = require("./lib/transformHtml");
const ESIListener = require("./lib/ESIListener");
const ListenerContext = require("./lib/ListenerContext");


function localEsi(html, req, res, next, options = {}) {
  const context = ListenerContext(req, res);
  const listener = ESIListener(context);
  transformHtml(html, listener, (err, parsed) => {
    if (err) return next(err);
    if (context.redirected) {
      return;
    }
    const useExternalSendFn = options && options.sendContext && options.send;
    if (context.replacement) {
      return useExternalSendFn ? options.send.call(options.sendContext, context.replacement) : res.send(context.replacement);
    }
    return useExternalSendFn ? options.send.call(options.sendContext, parsed) : res.send(parsed);
  });
}

module.exports = localEsi;
