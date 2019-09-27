"use strict";

const HtmlParser = require("atlas-html-stream");
const ESIParser = require("./ESIParser");
const {Transform, Readable} = require("stream");

const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const selfClosingElements = ["esi:include", "esi:eval", "esi:assign", "esi:debug"];

module.exports = {
  transform,
  asStream,
};

function transform(html, {onopentag, ontext, onclosetag}, onFinish) {
  const bufferStream = convert(html);
  const htmlParser = new HtmlParser({ preserveWS: true });

  const esiParser = new ESIParser(filter);

  const htmlWriter = new Transform({
    writableObjectMode: true,
    transform({tagname, attribs, text}, encoding, next) {
      if (text) return next(null, text);
      if (tagname && attribs) return next(null, opentag(tagname, attribs));
      else if (tagname) return next(null, closetag(tagname));
      return next();
    }
  });

  function opentag(tagname, attribs) {
    if (selfClosingElements.includes(tagname)) {
      return `<${tagname}${attributesToString(attribs)}/>`;
    }
    if (tagname === "!--") {
      return "<!--";
    }
    return `<${tagname}${attributesToString(attribs)}>`;
  }

  function closetag(tagname) {
    if (selfClosingElements.includes(tagname) || voidElements.includes(tagname)) {
      return "";
    }
    if (tagname === "!--") {
      return "-->";
    }
    return `</${tagname}>`;
  }

  return new Promise((resolve, reject) => {
    let data = "";
    bufferStream.pipe(htmlParser).pipe(esiParser).pipe(htmlWriter)
      .once("error", (err) => (onFinish || reject)(err))
      .on("data", (chunk) => {
        data += chunk;
      })
      .on("finish", () => {
        if (onFinish) onFinish(null, data);
        resolve(data);
      });
  });

  function filter({name, data, text}, next) {
    if (text) {
      return ontext(text, next);
    } else if (name && data) {
      return onopentag(name, data, next);
    } else {
      return onclosetag(name, next);
    }
  }
}

function asStream({onopentag, ontext, onclosetag}) {
  const htmlParser = new HtmlParser({ preserveWS: true });
  const esiParser = new ESIParser(filter);

  return htmlParser.pipe(esiParser);

  function filter({name, data, text}, next) {
    if (text) {
      return ontext(text, next);
    } else if (name && data) {
      return onopentag(name, data, next);
    } else {
      return onclosetag(name, next);
    }
  }
}

function convert(buf, chunkSize) {
  buf = Buffer.from(buf, "utf8");

  const reader = new Readable();
  reader.setEncoding("utf8");
  const hwm = reader._readableState.highWaterMark;

  if (!chunkSize || chunkSize < 1 || chunkSize > hwm) {
    chunkSize = hwm;
  }

  const len = buf.length;
  let start = 0;

  reader._read = function () {
    while (reader.push(buf.slice(start, (start += chunkSize)))) {
      if (start >= len) {
        reader.push(null);
        break;
      }
    }
  };
  return reader;
}

function attributesToString(attr) {
  if (!attr) return "";
  return Object.keys(attr).reduce((attributes, key) => {
    const value = attr[key];
    if (value === null) {
      return `${attributes} ${key}`;
    }
    attributes += ` ${key}="${value}"`;
    return attributes;
  }, "");
}
