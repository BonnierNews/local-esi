/* eslint-disable camelcase */
"use strict";
const esiExpressionParser = require("./esiExpressionParser");

module.exports = function evaluateExpression(test, context) {
  const funcs = {
    Identifier(node, nodeContext = context.assigns) {
      return nodeContext[node.name];
    },
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
    url_encode([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return "";
      }
      return encodeURIComponent(string);
    },
    add_header([name, value]) {
      context.emit("set", getFunc(name.type)(name), getFunc(value.type)(value));
    },
    set_redirect([location]) {
      context.emit("redirect", 302, getFunc(location.type)(location));
      context.redirected = true;
    },
    set_response_code([code]) {
      context.emit("status", getFunc(code.type)(code));
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

      return getFunc(node.property.type)(node.property, object);
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

  const parsedTree = esiExpressionParser(test);
  return getFunc(parsedTree.type)(parsedTree);

  function getFunc(name) {
    if (!funcs[name]) throw new Error(`${name} is not implemented`);
    return funcs[name];
  }
};
