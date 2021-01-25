"use strict";

const ESIEvaluator = require("./lib/ESIEvaluator");
const ListenerContext = require("./lib/ListenerContext");
const {asStream, transform, createESIParser} = require("./lib/transformHtml");

const redirectCodes = [301, 302, 303, 307, 308];

module.exports = localEsi;
module.exports.createStream = streaming;
module.exports.createParser = createParser;
module.exports.htmlWriter = require("./lib/htmlWriter");

function localEsi(html, req, res, next) {
  const context = ListenerContext(req);
  let completed = false;

  context.on("set_response_code", (statusCode, body) => {
    completed = true;
    res.status(statusCode).send(body === undefined ? "" : body);
  });
  context.on("add_header", (name, value) => {
    if (name.toLowerCase() === "set-cookie") {
      const cookie = parseCookie(value);
      if (cookie) {
        res.cookie(cookie.name, cookie.value, cookie.attributes);
      }
    } else {
      res.set(name, value);
    }
  });
  context.once("set_redirect", (statusCode, location) => {
    completed = true;
    res.redirect(location);
  });

  const listener = ESIEvaluator(context);
  return transform(html, listener, (err, parsed) => {
    if (err) return next(err);
    if (!completed) res.send(parsed);
  });
}

function streaming(req) {
  const context = ListenerContext(req);
  const listener = ESIEvaluator(context);
  const pipeline = asStream(listener);
  context.emitter = pipeline;

  let responseCode;
  const headers = {};

  pipeline
    .on("set_response_code", onResponseCode)
    .on("add_header", onAddHeader)
    .once("set_redirect", close);

  return pipeline;

  function onResponseCode(int, body) {
    responseCode = int;
    if (int > 399 || body) return close();
    if (headers.location && redirectCodes.includes(int)) pipeline.emit("set_redirect", responseCode, headers.location);
  }

  function onAddHeader(name, value) {
    const headerName = name.toLowerCase();
    headers[headerName] = value;
    if (headerName === "location" && redirectCodes.includes(responseCode)) pipeline.emit("set_redirect", responseCode, value);
  }

  function close() {
    pipeline
      .removeListener("set_response_code", onResponseCode)
      .removeListener("add_header", onAddHeader)
      .removeListener("set_redirect", close)
      .destroy();
  }
}

function createParser(req) {
  const context = ListenerContext(req);
  const listener = ESIEvaluator(context);
  const optimusPrime = createESIParser(listener);
  context.emitter = optimusPrime;
  return optimusPrime;
}

function parseCookie(cookieStr) {
  const attrs = cookieStr.split(";");
  if (!attrs || attrs.length === 0) return;

  const [name, value] = attrs[0].split("=");
  if (!name || !value) return;

  const attributes = attrs.reduce((acc, attr, index) => {
    if (index > 0) {
      const [attrName, attrValue] = attr.split("=");
      acc[attrName.trim()] = attrValue && attrValue.trim() || "";
    }
    return acc;
  }, {});

  return {
    name,
    value,
    attributes
  };
}
