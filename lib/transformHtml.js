"use strict";

const {Readable, pipeline} = require("stream");
const ESIParser = require("./ESIParser");
const HtmlParser = require("@bonniernews/atlas-html-stream");
const htmlWriter = require("./htmlWriter");
const pumpify = require("pumpify");

module.exports = {
  transform,
  asStream,
  convert,
  createESIParser,
};

function transform(html, listener, onFinish) {
  const bufferStream = convert(html);

  return new Promise((resolve, reject) => {
    let data = "";
    pipeline(bufferStream, asStream(listener), htmlWriter(), (err) => {
      if (onFinish) {
        onFinish(err, data);
        return resolve();
      }
      if (err) return reject(err);
      resolve(data);
    }).on("data", (chunk) => {
      data += chunk;
    });
  });
}

function asStream(listener) {
  const htmlParser = new HtmlParser({ preserveWS: true });
  const esiParser = createESIParser(listener);
  return pumpify.obj(htmlParser, esiParser);
}

function convert(buf, chunkSize, encoding = "utf8") {
  return Readable.from(buf, {encoding});
}

function createESIParser(evaluator) {
  return new ESIParser(filter);

  function filter({name, data, text}, next) {
    if (text) {
      return evaluator.ontext(text, next);
    } else if (name && data) {
      return evaluator.onopentag(name, data, next);
    } else {
      return evaluator.onclosetag(name, next);
    }
  }
}
