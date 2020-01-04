/* eslint-disable camelcase */
"use strict";

const crypto = require("crypto");
const esiExpressionParser = require("./esiExpressionParser2");

module.exports = function evaluateExpression(test, context, extractFromText) {
  const funcs = {
    exists([arg]) {
      return !!getFunc(arg.type)(arg);
    },
    int([arg]) {
      return parseInt(getFunc(arg.type)(arg)) || 0;
    },
    index([arg1, arg2]) {
      return getFunc(arg1.type)(arg1).indexOf(getFunc(arg2.type)(arg2));
    },
    base64_decode([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return "";
      }
      return Buffer.from(string, "base64").toString("utf8");
    },
    base64_encode([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return "";
      }
      return Buffer.from(string, "utf8").toString("base64");
    },
    digest_md5([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return [];
      }

      const md5 = crypto.createHash("md5").update(string).digest();
      const esihash = [];
      for (let offset = 0; offset < 16; offset += 4) {
        esihash.push(md5.readInt32LE(offset));
      }

      return esihash;
    },
    url_encode([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return "";
      }
      return encodeURIComponent(string);
    },
    add_header([name, value]) {
      context.res.set(getFunc(name.type)(name), getFunc(value.type)(value));
    },
    set_redirect([location]) {
      context.res.redirect(getFunc(location.type)(location));
      context.redirected = true;
    },
    set_response_code([code]) {
      context.res.status(getFunc(code.type)(code));
    },
    substr([arg1, arg2, arg3]) {
      const string = getFunc(arg1.type)(arg1);
      if (typeof string !== "string") {
        throw new Error("substr invoked on non-string");
      }
      let startIndex;
      let length;

      if (arg2) {
        startIndex = getFunc(arg2.type)(arg2);
      }

      if (typeof startIndex !== "number") {
        throw new Error("substr invoked with non-number as start index");
      }

      if (arg3) {
        length = getFunc(arg3.type)(arg3);
      }

      if (length < 0) {
        length = string.length - startIndex + length;
      }
      return string.substr(startIndex, length);
    },
    time() {
      return Math.round(Date.now() / 1000);
    },
    http_time([seconds]) {
      const secondsInt = parseInt(getFunc(seconds.type)(seconds));
      const now = new Date(secondsInt * 1000);
      return now.toUTCString();
    },
    Identifier(node, nodeContext = context.assigns) {
      return nodeContext[node.name];
    },
    CallExpression(node) {
      return getFunc(node.callee.name)(node.arguments);
    },
    LogicalExpression(node) {
      const left = getFunc(node.left.type);
      const right = getFunc(node.right.type);

      if (node.operator === "&" || node.operator === "&&") return left(node.left) && right(node.right);
      if (node.operator === "|" || node.operator === "||") return left(node.left) || right(node.right);

      throw new Error(`Uknown BinaryExpression operator ${node.operator}`);
    },
    BinaryExpression(node) {
      const left = getFunc(node.left.type)(node.left);
      const right = getFunc(node.right.type)(node.right);

      if (node.operator === "==") return left === right;
      if (node.operator === "!=") return left !== right;
      if (node.operator === ">=") return left >= right;
      if (node.operator === "<=") return left <= right;
      if (node.operator === "<") return left < right;
      if (node.operator === ">") return left > right;
      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      if (node.operator === "/") return left / right;
      if (node.operator === "%") return left % right;
      if (node.operator === "has") return left.indexOf(right) > -1;
      if (node.operator === "has_i") return left.toLowerCase().indexOf(right.toLowerCase()) > -1;
      if (node.operator === "matches") {
        if (!left) {
          return;
        }
        return left.match(right);
      }
      if (node.operator === "matches_i") {
        if (!left) {
          return;
        }
        return left.match(new RegExp(right, "i"));
      }

      throw new Error(`Uknown BinaryExpression operator ${node.operator}`);
    },
    MemberExpression(node) {
      const object = getFunc(node.object.type)(node.object);
      if (!object) return;

      const property = getFunc(node.property.type)(node.property);
      if (property === undefined) return;

      return object[property];
    },
    ArrayExpression(node) {
      if (!node.elements) return;
      return node.elements.map((elm) => getFunc(elm.type)(elm));
    },
    Literal(node) {
      return node.value;
    },
    UnaryExpression(node) {
      if (node.operator !== "!") {
        throw new Error(`Unary operator ${node.operator} not implemented`);
      }

      return !getFunc(node.argument.type)(node.argument);
    }
  };

  if (extractFromText) {
    return esiExpressionParser(test, true);
  }

  const parsedTree = esiExpressionParser(test);
  return getFunc(parsedTree.type)(parsedTree);

  function getFunc(name) {
    if (!funcs[name]) throw new Error(`${name} is not implemented`);
    return funcs[name];
  }
};
