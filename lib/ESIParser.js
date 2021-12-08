"use strict";

const {Transform} = require("stream");

class ESIParser extends Transform {
  constructor(evaluator, options) {
    options = {...options, objectMode: true};
    super(options);
    this.evaluator = evaluator;
  }

  _transform(obj, encoding, next) {
    this.filter(obj, next);
  }

  filter({name, data, text}, next) {
    if (text) {
      return this.evaluator.ontext(text, next);
    } else if (name && data) {
      return this.evaluator.onopentag(name, data, next);
    } else {
      return this.evaluator.onclosetag(name, next);
    }
  }
}

module.exports = ESIParser;
