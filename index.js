"use strict";

const ESI = require("./lib/ESI");
const HtmlParser = require("../atlas-html-stream/src/HtmlParser.js");
const HTMLWriter = require("./lib/HTMLWriter");

module.exports = {
  ESI,
  HTMLWriter,
  parse,
};

async function parse(html, options) {
  // console.log("parse options", options);
  const response = {};

  const readableStream = new ReadableStream({
    pull(controller) {
      controller.enqueue(html);
      controller.close();
    },
  });

  const parserTransformer = new HtmlParser({ preserveWS: true });
  const parserTransformStream = new TransformStream(parserTransformer);

  const esiTransformer = new ESI(options);
  esiTransformer.addEventListener("set_response_code", onSetResponseCode);
  esiTransformer.addEventListener("add_header", onAddHeader);
  esiTransformer.addEventListener("set_redirect", onRedirect);
  const esiTransformStream = new TransformStream(esiTransformer);

  const writerTransformer = new HTMLWriter();
  const writerTransformStream = new TransformStream(writerTransformer);

  const transformedStream = readableStream
    .pipeThrough(parserTransformStream)
    .pipeThrough(esiTransformStream)
    .pipeThrough(writerTransformStream);

  const reader = transformedStream.getReader();

  let body = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    body += value;
  }
  // console.log("parse returning body: ", body);
  // console.log("parse returning response: ", response);
  return { body, ...response };

  function onRedirect(event) {
    // console.log("in onRedirect function", event);
    const { statusCode, location } = event.detail;
    response.statusCode = statusCode;
    if (location) {
      response.headers = response.headers || {};
      response.headers.location = location;
    }
    // this.destroy();
  }

  function onAddHeader(event) {
    // console.log("in onAddHeader function", event);
    const { name, value } = event.detail;
    // console.log(`in onAddHeader name=${name} value=${value}`);

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
    // console.log("in onSetResponseCode function", event);

    const { statusCode, withBody } = event.detail;

    response.statusCode = statusCode;
    if (!withBody) return;
    response.body = withBody;
    // this.destroy();
  }
}
