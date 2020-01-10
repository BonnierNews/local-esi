"use strict";

const evaluate = require("./expression/evaluate");
const {parse, split} = require("./expression/parser");

module.exports = {
  assign,
  test,
  replace,
};

function assign(value, context) {
  if (value === "true" || value === "false") return value;
  return evaluate(parse(value), context);
}

function test(expression, context) {
  return evaluate(parse(expression), context);
}

function replace(text, context) {
  if (!text) return;

  const expressions = split(text);
  if (!expressions.length) return removeReservedCharacters(text);

  let newText = "";

  for (const expr of expressions) {
    if (expr.type === "TEXT") {
      newText += removeReservedCharacters(expr.text);
      continue;
    }

    let result = evaluate(expr.expression, context);
    if (Array.isArray(result)) result = `[${result.join(", ")}]`;

    if (result === undefined) continue;

    newText += result;
  }

  return newText;
}

function removeReservedCharacters(original) {
  if (!original || typeof original !== "string") {
    return original;
  }

  let text = original.replace(/\\["]/g, "\"");

  text = text.replace(/(^|[^\\])(\\)($|[^\\])/ig, (_, group1, _2, group3) => { //Remove backslashes, but not escaped ones
    return `${group1}${group3}`;
  });

  text = text.replace(/\\\\/g, "\\"); //Escaped backslashes, remove the escaping backslash

  return text;
}
