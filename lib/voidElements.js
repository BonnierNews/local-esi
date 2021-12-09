"use strict";

const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const selfClosingElements = ["esi:include", "esi:eval", "esi:assign", "esi:debug", "esi:break"];

module.exports = {
  voidElements,
  selfClosingElements,
};
