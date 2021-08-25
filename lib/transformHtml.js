"use strict";

const HtmlParser = require("@bonniernews/atlas-html-stream");
const ESIParser = require("./ESIParser");
const pump = require("pump"); // replace with stream.pipeline when upping to node 10
const pumpify = require("pumpify");
const {Readable} = require("stream");
const htmlWriter = require("./htmlWriter");

module.exports = {
  transform,
  asStream,
  convert,
  createESIParser,
};

function transform(html, listener, onFinish) {
  const bufferStream = convert(html);

  return new Promise((resolve, reject) => {
    let data = "";
    pump(bufferStream, asStream(listener), htmlWriter(), (err) => {
      if (onFinish) {
        onFinish(err, data);
        return resolve();
      }
      if (err) return reject(err);
      resolve(data);
    }).on("data", (chunk) => {
      data += chunk;
    });
  });
}

function asStream(listener) {
  const htmlParser = new HtmlParser({ preserveWS: true });
  const esiParser = createESIParser(listener);
  return pumpify.obj(htmlParser, esiParser);
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
