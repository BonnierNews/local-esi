"use strict";

const {Transform} = require("stream");

module.exports = class ESIBase extends Transform {
  constructor(evaluator) {
    super({objectMode: true});
    this.evaluator = evaluator;
    this.context = evaluator.context;
  }
  _transform({name, data, text}, encoding, next) {
    if (text) {
      return this.evaluator.ontext(text, next);
    } else if (name && data) {
      return this.evaluator.onopentag(name, data, next);
    } else {
      return this.evaluator.onclosetag(name, next);
    }
  }
};
