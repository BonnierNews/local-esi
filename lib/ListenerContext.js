"use strict";

const {EventEmitter} = require("events");

module.exports = function ListenerContext(req, res, emitter) {
  emitter = emitter || new EventEmitter();

  return {
    assigns: Object.assign(buildHeaderVariables(req && req.headers), {
      "HTTP_COOKIE": req.cookies || {},
      "REQUEST_PATH": req.path || {},
      "QUERY_STRING": req.query || {}
    }),
    cookies: req.cookies,
    req,
    res,
    isProcessing() {
      return Boolean((this.tags.length || this.isSubContext) && !this.isInPlainText());
    },
    isInPlainText() {
      return this.tags.some((tag) => tag.plainText);
    },
    inAttempt: false,
    lastAttemptWasError: false,
    inExcept: false,
    includeError: false,
    replacement: "",
    chooses: [],
    tags: [],
    get emitter() {
      return emitter;
    },
    set emitter(value) {
      emitter = value;
    },
    on(...args) {
      emitter.on(...args);
    },
    once(...args) {
      emitter.once(...args);
    },
    emit(...args) {
      emitter.emit(...args);
    },
    removeListener(...args) {
      emitter.removeListener(...args);
    },
    clone(linkAssigns) {
      const c = ListenerContext(req, res, emitter);
      if (linkAssigns) {
        c.assigns = this.assigns;
      }
      return c;
    },
    subContext() {
      const clone = this.clone(true);
      clone.isSubContext = true;
      return clone;
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
};
