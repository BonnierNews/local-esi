import { Transform } from "stream";

import { chunkToMarkup } from "./markup.js";

export default class HTMLWriter extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }
  _transform(chunks, encoding, next) {
    if (!chunks) return next();
    chunks = Array.isArray(chunks) ? chunks : [ chunks ];
    let markup = "";
    for (const chunk of chunks) {
      markup += chunkToMarkup(chunk);
    }
    return next(null, markup);
  }
}
