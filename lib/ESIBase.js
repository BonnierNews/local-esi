"use strict";

module.exports = class ESIBase extends EventTarget {
  constructor(evaluator) {
    super();
    // console.log("ESIBase constructor");
    this.evaluator = evaluator;
    this.context = evaluator.context;
  }
  transform(chunk, controller) {
    const { name, data, text } = chunk;
    if (text) {
      // console.log(`ESIBase::transform text ${text}`)
      return this.evaluator.ontext(text, controller);
    } else if (name && data) {
      // console.log(`ESIBase::transform onopentag ${name}`, data)
      return this.evaluator.onopentag(name, data, controller);
    } else {
      // console.log(`ESIBase::transform onclosetag ${name}`, data)
      return this.evaluator.onclosetag(name, controller);
    }
  }
};
