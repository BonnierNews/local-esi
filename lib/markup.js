"use strict";

const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const selfClosingElements = ["esi:include", "esi:eval", "esi:assign", "esi:debug"];

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
  return Object.keys(attr).reduce((attributes, key) => {
    const value = attr[key];
    if (value === "") {
      return `${attributes} ${key}`;
    }
    attributes += ` ${key}="${value}"`;
    return attributes;
  }, "");
}
