import HTMLStream from "@bonniernews/atlas-html-stream";

import ESI from "./lib/ESI.js";
import HTMLWriter from "./lib/HTMLWriter.js";

export {
  ESI,
  HTMLWriter,
  parse,
};

async function parse(html, options) {
  const response = {};

  let body = "";

  const esi = new ESI(options);
  esi.addEventListener("set_response_code", onSetResponseCode);
  esi.addEventListener("add_header", onAddHeader);
  esi.addEventListener("set_redirect", onRedirect);

  const readableStream = ReadableStream.from(html);
  const htmlTransformer = new HTMLStream({ preserveWS: true });
  const htmlWriter = new HTMLWriter();

  const transformedStream = readableStream
    .pipeThrough(htmlTransformer)
    .pipeThrough(esi)
    .pipeThrough(htmlWriter);

  const reader = transformedStream.getReader();

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    } else {
      body += value;
    }
  }

  return { body, ...response };

  function onRedirect(event) {
    const { statusCode, location } = event.detail;
    response.statusCode = statusCode;
    if (location) {
      response.headers = response.headers || {};
      response.headers.location = location;
    }
  }

  function onAddHeader(event) {
    const { name, value } = event.detail;
    const headers = response.headers = response.headers || {};
    const lname = name.toLowerCase();
    if (lname === "set-cookie") {
      headers[lname] = headers[lname] || [];
      headers[lname].push(value);
    } else {
      headers[lname] = value;
    }
  }

  function onSetResponseCode(event) {
    const { statusCode, withBody } = event.detail;
    response.statusCode = statusCode;
    if (!withBody) return;
    response.body = withBody;
  }
}
