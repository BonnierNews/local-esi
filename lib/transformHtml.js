"use strict";

const HtmlParser = require("atlas-html-stream");
const {Readable, Transform} = require("stream");

class HtmlTransformer extends Transform {
  constructor(filter, options) {
    options = Object.assign({}, options, {objectMode: true});
    super(options);
    this.filter = filter;
  }

  _transform(obj, encoding, next) {
    const self = this;

    this.filter(obj, (err, chunk) => {
      if (err) return next(err);
      if (chunk) self.push(chunk);
      next();
    });
  }
}

module.exports = function parse(html, {onopentag, ontext, onclosetag}, onFinish) {
  const bufferStream = convert(html);
  const htmlParser = new HtmlParser({ preserveWS: true });

  const transform = new HtmlTransformer(filter);

  return new Promise((resolve, reject) => {
    let data = "";
    bufferStream.pipe(htmlParser).pipe(transform)
      .once("error", (err) => (onFinish || reject)(err))
      .on("data", (chunk) => {
        data += chunk;
      })
      .on("finish", () => {
        if (onFinish) onFinish(null, data);
        resolve(data);
      });
  });

  function filter({name, data, text}, next) {
    if (text) {
      return ontext(text, next);
    } else if (name && data) {
      return onopentag(name, data, next);
    } else {
      return onclosetag(name, next);
    }
  }
};

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
