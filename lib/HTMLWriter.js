import { chunkToMarkup } from "./markup.js";

export default class HTMLWriter extends TransformStream {
  constructor() {
    super({
      transform: (chunk, controller) => {
        this.transform(chunk, controller);
      },
    });
    this.totalMarkup = "";
  }
  transform(chunks, controller) {
    if (!chunks) return;
    chunks = Array.isArray(chunks) ? chunks : [ chunks ];
    let markup = "";
    for (const chunk of chunks) {
      markup += chunkToMarkup(chunk);
    }
    controller.enqueue(markup);
  }
}
