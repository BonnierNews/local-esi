"use strict";

const {chunkToMarkup} = require("./markup");
const {EventEmitter} = require("events");
const {replace} = require("./evaluateExpression");
const request = require("got");

module.exports = class ListenerContext {
  constructor(req, emitter) {
    this.emitter = emitter || new EventEmitter();
    this.req = req;
    this.inAttempt = false;
    this.lastAttemptWasError = false;
    this.inExcept = false;
    this.includeError = false;
    this.replacement = "";
    this.chooses = [];
    this.tags = [];
    this.cookies = req && req.cookies;
    this.assigns = {
      ...buildHeaderVariables(req && req.headers),
      "HTTP_COOKIE": req && req.cookies || {},
      "REQUEST_PATH": req && req.path || {},
      "QUERY_STRING": req && req.query || {},
    };
  }
  isProcessing() {
    return Boolean((this.tags.length || this.isSubContext) && !this.isInPlainText());
  }
  isInPlainText() {
    return this.tags.some((tag) => tag.plainText);
  }
  clone(linkAssigns) {
    const c = new ListenerContext(this.req, this.emitter);
    if (linkAssigns) {
      c.assigns = this.assigns;
    }
    return c;
  }
  subContext() {
    const clone = this.clone(true);
    clone.isSubContext = true;
    return clone;
  }
  shouldWrite() {
    if (this.inExcept && !this.lastAttemptWasError) return false;
    if (this.breakHit) return false;

    if (this.chooses.length) {
      return this.chooses.every((choose) => choose.isCurrentlyEvaluatedTo);
    }

    return true;
  }
  writeToResult(chunk, next) {
    if (this.bufferingString) {
      const [current = {}] = this.tags.slice(-1);
      if (typeof chunk === "function") {
        chunk = chunk();
      }

      current.text += chunkToMarkup(chunk);

      return next();
    }

    if (this.shouldWrite()) {
      if (typeof chunk === "function") {
        chunk = chunk();
      }
      return next(null, chunk);
    }

    next();
  }
  async fetchIncluded(data, fetchCallback) {
    const options = {
      throwHttpErrors: false,
      retry: 0,
      headers: Object.assign({}, this.req.headers)
    };

    options.headers.host = undefined;
    delete options.headers["content-type"];

    let includeUrl = replace(data.src, this);
    if (!includeUrl.startsWith("http")) {
      includeUrl = new URL(includeUrl, `http://localhost:${this.req.socket.server.address().port}`).toString();
    }

    try {
      const response = await request.get(includeUrl, options);
      if (response.statusCode > 399) {
        throw new Error(`Response code: ${response.statusCode}`);
      }
      return fetchCallback(null, response.body);
    } catch (err) {
      if (this.inAttempt) {
        this.lastAttemptWasError = true;
        return fetchCallback(null, "");
      }
      return fetchCallback(err);
    }
  }
};

function buildHeaderVariables(headers) {
  if (!headers) return {};
  return Object.entries(headers).reduce((acc, pair) => {
    const header = pair[0];
    if (header === "x-forwarded-for") {
      acc.REMOTE_ADDR = pair[1];
    }

    const httpKey = header.replace(/-/g, "_").toUpperCase();
    acc[`HTTP_${httpKey}`] = pair[1];
    return acc;
  }, {});
}
