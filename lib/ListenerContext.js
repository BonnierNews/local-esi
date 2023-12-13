import { chunkToMarkup } from "./markup.js";
import { replace } from "./evaluateExpression.js";

export default class ListenerContext {
  constructor(options = {}, emitter) {
    this.options = options;
    this.emitter = emitter || new EventTarget();
    this.inAttempt = false;
    this.inExcept = false;
    this.includeError = false;
    this.md5digest = options.md5digest; // should have the same interface as crypto.subtle.digest (data) => md5
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
    if (this.breakHit) return false;
    if (!this.tries.every((t) => t.success ? t.inAttempt : t.inExcept)) return false;
    if (!this.chooses.every((choose) => choose.chosen)) return false;
    return true;
  }
  writeToResult(chunk, enqueue) {
    if (this.bufferingString) {
      const [ current = {} ] = this.tags.slice(-1);
      if (typeof chunk === "function") {
        chunk = chunk();
      }
      current.text += chunkToMarkup(chunk);
      return;
    }

    if (this.shouldWrite()) {
      if (typeof chunk === "function") {
        chunk = chunk();
      }
      return enqueue(chunk);
    }
  }
  async fetch(data) {
    const self = this;
    const options = {
      method: "GET",
      headers: {
        ...self.options.headers,
        ...getAttributeHeaders(data.setheader),
        host: undefined,
        "content-type": undefined,
      },
    };

    let fetchUrl = replace(data.src, self);
    let backend;
    if (!fetchUrl.startsWith("http")) {
      let host = this.options.localhost || self.assigns.HTTP_HOST;
      // if this is a relative url and we are running at computeAtEdge
      if (fetchUrl.startsWith("/") && self.options.computeAtEdge) {
        backend = self.options.computeAtEdge.defaultBackend;
        // maybe we have different backends, let's check
        if (this.options.computeAtEdge.pathToBackend) {
          // iterate over the paths and do a prefix match
          for (const [ prefix, backendCand ] of Object.entries(this.options.computeAtEdge.pathToBackend)) {
            // found a backend, woho
            if (fetchUrl.startsWith(prefix)) {
              backend = backendCand.backend;
              host = backendCand.host;
              break;
            }
          }
        }
      }
      fetchUrl = new URL(fetchUrl, `${self.options.useHttps ? "https" : "http"}://${host}`).toString();
    }

    // maybe set backend
    options.backend = backend;

    // maybe we need to set some headers for the backend
    if (backend && this.options.computeAtEdge.backendHeaders[backend]) {
      options.headers = { ...options.headers, ...this.options.computeAtEdge.backendHeaders[backend] };
    }

    try {
      const resp = await fetch(fetchUrl, options);
      if (resp.status < 400) {
        // FIXME: replace with new TextDecoderStream() when compute @ edge implements it
        const decoder = new TextDecoder();
        const textDecoderStream = new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(decoder.decode(chunk));
          },
        });
        return resp.body.pipeThrough(textDecoderStream);
      }
      if (self.tries.at(-1)?.inAttempt) {
        self.tries.at(-1).success = false;
      }
      throw new Error(`Bad status ${resp.status}`);
    } catch (err) {
      if (!self.tries.at(-1)?.inAttempt) {
        throw err;
      }
      self.tries.at(-1).success = false;
      err.inAttempt = true;
      throw err;
    }

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
