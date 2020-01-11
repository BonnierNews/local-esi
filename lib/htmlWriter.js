"use strict";

const {chunkToMarkup} = require("./markup");
const {Transform} = require("stream");

module.exports = function htmlWriter() {
  return new Transform({
    writableObjectMode: true,
    transform(chunks, encoding, next) {
      if (!chunks) return next();
      chunks = Array.isArray(chunks) ? chunks : [chunks];
      let markup = "";
      for (const chunk of chunks) {
        markup += chunkToMarkup(chunk);
      }
      return next(null, markup);
    }
  });
};

