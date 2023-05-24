"use strict";

const { chunkToMarkup } = require("./markup");

module.exports = class HTMLWriter {
  transform(chunks, controller) {
    if (!chunks) return next();
    chunks = Array.isArray(chunks) ? chunks : [ chunks ];
    let markup = "";
    for (const chunk of chunks) {
      markup += chunkToMarkup(chunk);
    }
    controller.enqueue(markup);
  }
};
