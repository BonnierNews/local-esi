"use strict";

const ESIEvaluator = require("./lib/ESIEvaluator");
const ListenerContext = require("./lib/ListenerContext");
const {asStream, transform} = require("./lib/transformHtml");

function localEsi(html, req, res, next) {
  const context = ListenerContext(req, res);
  let completed = false;

  context.on("status", (statusCode) => {
    res.status(statusCode);
  });
  context.on("send-body", (statusCode, body) => {
    completed = true;
    res.status(statusCode).send(body);
  });
  context.on("set-header", (name, value) => {
    res.set(name, value);
  });
  context.once("redirect", (statusCode, location) => {
    res.redirect(location);
  });

  const listener = ESIEvaluator(context);
  return transform(html, listener, (err, parsed) => {
    if (err) return next(err);
    if (context.redirected) {
      return;
    }
    if (context.replacement) {
      return res.send(context.replacement);
    }
    if (!completed) res.send(parsed);
  });
}

function streaming(req) {
  const context = ListenerContext(req);
  const listener = ESIEvaluator(context);
  const pipeline = asStream(listener);
  context.emitter = pipeline;

  pipeline.once("send-body", close);
  pipeline.once("redirect", close);

  return pipeline;

  function close() {
    pipeline.removeListener("send-body", close);
    pipeline.removeListener("redirect", close);
    pipeline.destroy();
  }
}

module.exports = localEsi;
module.exports.createStream = streaming;
