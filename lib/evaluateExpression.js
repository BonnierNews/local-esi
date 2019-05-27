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
      return parseInt(getFunc(arg.type)(arg));
    },
    index([arg1, arg2]) {
      return getFunc(arg1.type)(arg1).indexOf(getFunc(arg2.type)(arg2));
    },
    // eslint-disable-next-line camelcase
    base64_decode([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return "";
      }
      return Buffer.from(string, "base64").toString("utf8");
    },
    // eslint-disable-next-line camelcase
    base64_encode([arg]) {
      const string = getFunc(arg.type)(arg);
      if (!string) {
        return "";
      }
      return Buffer.from(string, "utf8").toString("base64");
    },
    time() {
      return Math.round(Date.now() / 1000);
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
