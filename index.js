import { pipeline, Readable } from "stream";
import HTMLStream from "@bonniernews/atlas-html-stream";

import ESI from "./lib/ESI.js";
import HTMLWriter from "./lib/HTMLWriter.js";

export {
  ESI,
  HTMLWriter,
};

export function parse(html, options) {
  const response = {};

  let body = "";

  const esi = new ESI(options)
    .on("set_response_code", onSetResponseCode)
    .on("add_header", onAddHeader)
    .once("set_redirect", onRedirect);

  return new Promise((resolve, reject) => {
    pipeline([
      Readable.from(html),
      new HTMLStream({ preserveWS: true }),
      esi,
      new HTMLWriter(),
    ], (err) => {
      if (err && ![ "ERR_STREAM_DESTROYED", "ERR_STREAM_PREMATURE_CLOSE" ].includes(err.code)) return reject(err);
      resolve({
        body,
        ...response,
      });
    }).on("data", (chunk) => {
      body += chunk;
    });
  });

  function onRedirect(statusCode, location) {
    response.statusCode = statusCode;
    if (location) {
      response.headers = response.headers || {};
      response.headers.location = location;
    }
    this.destroy();
  }

  function onAddHeader(name, value) {
    const headers = response.headers = response.headers || {};
    const lname = name.toLowerCase();
    if (lname === "set-cookie") {
      headers[lname] = headers[lname] || [];
      headers[lname].push(value);
    } else {
      headers[lname] = value;
    }
  }

  function onSetResponseCode(statusCode, withBody) {
    response.statusCode = statusCode;
    if (!withBody) return;
    response.body = withBody;
    this.destroy();
  }
}
