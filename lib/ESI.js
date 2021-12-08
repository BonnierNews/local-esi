"use strict";

const ESIEvaluator = require("./ESIEvaluator");
const ListenerContext = require("./ListenerContext");
const ESIBase = require("./ESIBase");

module.exports = class ESI extends ESIBase {
  constructor(req) {
    const evaluator = new ESIEvaluator(new ListenerContext(req));
    super(evaluator);
    this.context.emitter = this;
  }
};
