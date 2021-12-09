"use strict";

const {selfClosingElements, voidElements} = require("./voidElements");

module.exports = {
  chunkToMarkup,
  opentag,
  closetag,
  voidElements,
  selfClosingElements,
};

function chunkToMarkup({name, data, text}) {
  let markup = "";
  if (text) markup += text;
  else if (name && data) markup += opentag(name, data);
  else if (name) markup += closetag(name);

  return markup;
}

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

function attributesToString(attr) {
  if (!attr) return "";
  return Object.entries(attr).reduce((attributes, [key, value]) => {
    if (value === "") {
      return `${attributes} ${key}`;
    } else if (value.indexOf("\"") > -1) {
      attributes += ` ${key}="${value.replace(/"/g, "&quot;")}"`;
    } else {
      attributes += ` ${key}="${value}"`;
    }
    return attributes;
  }, "");
}
