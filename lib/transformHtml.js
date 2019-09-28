"use strict";

const HtmlParser = require("atlas-html-stream");
const ESIParser = require("./ESIParser");
const {chunkToMarkup} = require("./markup");
const {Transform, Readable} = require("stream");

module.exports = {
  transform,
  asStream,
  convert,
  createESIParser,
};

function transform(html, listener, onFinish) {
  const bufferStream = convert(html);
  const htmlParser = new HtmlParser({ preserveWS: true });
  const esiParser = createESIParser(listener);
  const htmlWriter = new Transform({
    writableObjectMode: true,
    transform(chunks, encoding, next) {
      if (!chunks) return next();

      chunks = Array.isArray(chunks) ? chunks : [chunks];
      let markup = "";
      for (const chunk of chunks) {
        markup += chunkToMarkup(chunk)
      }
      return next(null, markup);
    }
  });

  return new Promise((resolve, reject) => {
    let data = "";
    bufferStream
      .pipe(htmlParser)
      .pipe(esiParser)
      .once("error", (err) => (onFinish || reject)(err))
      .pipe(htmlWriter)
      .once("error", (err) => (onFinish || reject)(err))
      .on("data", (chunk) => {
        data += chunk;
      })
      .on("finish", () => {
        if (onFinish) onFinish(null, data);
        resolve(data);
      });
  });
}

function asStream(listener) {
  const htmlParser = new HtmlParser({ preserveWS: true });
  const esiParser = createESIParser(listener);
  htmlParser.pipe(esiParser);
  return htmlParser;
}

function convert(buf, chunkSize) {
  buf = Buffer.from(buf, "utf8");

  const reader = new Readable();
  reader.setEncoding("utf8");
  const hwm = reader._readableState.highWaterMark;

  if (!chunkSize || chunkSize < 1 || chunkSize > hwm) {
    chunkSize = hwm;
  }

  const len = buf.length;
  let start = 0;

  reader._read = function () {
    while (reader.push(buf.slice(start, (start += chunkSize)))) {
      if (start >= len) {
        reader.push(null);
        break;
      }
    }
  };
  return reader;
}

function createESIParser({onopentag, ontext, onclosetag}) {
  return new ESIParser(filter);

  function filter({name, data, text}, next) {
    if (text) {
      return ontext(text, next);
    } else if (name && data) {
      return onopentag(name, data, next);
    } else {
      return onclosetag(name, next);
    }
  }
}
