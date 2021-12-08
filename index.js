"use strict";

const {Readable, pipeline} = require("stream");
const HtmlParser = require("@bonniernews/atlas-html-stream");
const HTMLWriter = require("./lib/HTMLWriter");
const ESI = require("./lib/ESI");

module.exports = localEsi;
module.exports.ESI = ESI;
module.exports.HTMLWriter = HTMLWriter;

function localEsi(html, req, res, next) {
  let completed = false;

  const esi = new ESI(req);
  esi.context.emitter.on("set_response_code", onSetResponseCode);
  esi.context.emitter.on("add_header", onAddHeader);
  esi.context.emitter.once("set_redirect", onRedirect);

  let data = "";
  pipeline([
    Readable.from(html),
    new HtmlParser({ preserveWS: true }),
    esi,
    new HTMLWriter(),
  ], (err) => {
    if (err && !["ERR_STREAM_DESTROYED", "ERR_STREAM_PREMATURE_CLOSE"].includes(err.code)) return next(err);
    if (!completed) res.send(data);
  }).on("data", (chunk) => {
    data += chunk;
  });

  function onRedirect(statusCode, location) {
    completed = true;
    res.redirect(location);
    this.destroy();
  }

  function onAddHeader(name, value) {
    if (name.toLowerCase() === "set-cookie") {
      const cookie = parseCookie(value);
      if (cookie) {
        res.cookie(cookie.name, cookie.value, cookie.attributes);
      }
    } else {
      res.set(name, value);
    }
  }

  function onSetResponseCode(statusCode, body) {
    completed = true;
    res.status(statusCode).send(body === undefined ? "" : body);
  }
}

function parseCookie(cookieStr) {
  const attrs = (cookieStr || "").split(";");
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
