"use strict";

const {Transform} = require("stream");

class ESIParser extends Transform {
  constructor(filter, options) {
    options = {...options, objectMode: true};
    super(options);
    this.filter = filter;
  }

  _transform(obj, encoding, next) {
    this.filter(obj, next);
  }
}

module.exports = ESIParser;
