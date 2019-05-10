"use strict";


const transformHtml = require("./lib/transformHtml");
const ESIListener = require("./lib/ESIListener");
const ListenerContext = require("./lib/ListenerContext");


function localEsi(html, req, res, next) {
  const context = ListenerContext(req, res);
  const listener = ESIListener(context);
  transformHtml(html, listener, (err, parsed) => {
    if (err) return next(err);
    if (context.redirected) {
      return;
    }
    if (context.replacement) {
      return res.send(context.replacement);
    }
    res.send(parsed);
  });
}

module.exports = localEsi;
