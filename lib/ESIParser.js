"use strict";

const {Transform} = require("stream");

class ESIParser extends Transform {
  constructor(filter, options) {
    options = {...options, objectMode: true};
    super(options);
    this.filter = filter;
  }

  _transform(obj, encoding, next) {
    this.filter(obj, (err, chunk) => {
      if (err) return next(err);
      if (chunk) {
        return next(null, chunk);
      }
      console.log("W", chunk, typeof chunk)
      next();
    });
  }
}

module.exports = ESIParser;
