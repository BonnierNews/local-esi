import { EventEmitter } from "events";

import request from "got";

import { chunkToMarkup } from "./markup.js";
import { replace } from "./evaluateExpression.js";

export default class ListenerContext {
  constructor(options = {}, emitter) {
    this.options = options;
    this.emitter = emitter || new EventEmitter();
    this.inAttempt = false;
    this.inExcept = false;
    this.includeError = false;
    this.replacement = "";
    this.chooses = [];
    this.tags = [];
    this.tries = [];
    this.cookies = options.cookies;
    this.assigns = {
      ...buildHeaderVariables(options.headers),
      ...buildGeoSubstructures(options.headers),
      HTTP_COOKIE: options.cookies || {},
      REQUEST_PATH: options.path || {},
      QUERY_STRING: options.query || {},
    };
  }
  isProcessing() {
    return Boolean((this.tags.length || this.isSubContext) && !this.isInPlainText());
  }
  isInPlainText() {
    return this.tags.some((tag) => tag.plainText);
  }
  clone(linkAssigns) {
    const c = new ListenerContext(this.options, this.emitter);
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
    if (this.inExcept && !this.tries.at(-1)?.failed) return false;
    if (this.breakHit) return false;

    if (this.chooses.length) {
      return this.chooses.every((choose) => choose.chosen);
    }

    return true;
  }
  writeToResult(chunk, next) {
    if (this.bufferingString) {
      const [ current = {} ] = this.tags.slice(-1);
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
  fetch(data) {
    const self = this;
    const options = {
      throwHttpErrors: false,
      method: "GET",
      retry: 0,
      headers: {
        ...self.options.headers,
        ...getAttributeHeaders(data.setheader),
        host: undefined,
        "content-type": undefined,
      },
    };

    let fetchUrl = replace(data.src, self);
    if (!fetchUrl.startsWith("http")) {
      const host = this.options.localhost || self.assigns.HTTP_HOST;
      fetchUrl = new URL(fetchUrl, `http://${host}`).toString();
    }

    return request.stream(fetchUrl, options)
      .on("response", function onResponse(resp) {
        if (resp.statusCode < 400) return;
        if (self.inAttempt) {
          self.tries.at(-1).failed = true;
          return this.push(null);
        }
        return this.destroy(new request.HTTPError(resp));
      })
      .on("error", (err) => {
        if (!self.inAttempt) return;
        self.tries.at(-1).failed = true;
        err.inAttempt = true;
      });

    function getAttributeHeaders(attr) {
      if (!attr) return;
      const [ key, val ] = attr.split(":");
      return { [key]: replace(val, self) };
    }
  }
}

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

function buildGeoSubstructures(headers) {
  return {
    GEO: headers?.["x-localesi-geo"]
      ? JSON.parse(headers["x-localesi-geo"])
      : {
        country_code: "SE",
        georegion: 208,
      },
  };
}
