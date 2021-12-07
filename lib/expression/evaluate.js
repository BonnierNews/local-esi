/* eslint-disable camelcase */
"use strict";

const crypto = require("crypto");

class Evaluator {
  constructor(context) {
    this.context = context;
  }
  exists([arg]) {
    return !!this.getFunc(arg.type).call(this, arg);
  }
  int([arg]) {
    return parseInt(this.getFunc(arg.type).call(this, arg)) || 0;
  }
  index([arg1, arg2]) {
    return this.getFunc(arg1.type).call(this, arg1).indexOf(this.getFunc(arg2.type).call(this, arg2));
  }
  base64_decode([arg]) {
    const string = this.getFunc(arg.type).call(this, arg);
    if (!string) {
      return "";
    }
    return Buffer.from(string, "base64").toString("utf8");
  }
  base64_encode([arg]) {
    const string = this.getFunc(arg.type).call(this, arg);
    if (!string) {
      return "";
    }
    return Buffer.from(string, "utf8").toString("base64");
  }
  digest_md5([arg]) {
    const string = this.getFunc(arg.type).call(this, arg);
    if (!string) {
      return [];
    }

    const md5 = crypto.createHash("md5").update(string).digest();
    const esihash = [];
    for (let offset = 0; offset < 16; offset += 4) {
      esihash.push(md5.readInt32LE(offset));
    }

    return esihash;
  }
  url_encode([arg]) {
    const string = this.getFunc(arg.type).call(this, arg);
    if (!string) {
      return "";
    }
    return encodeURIComponent(string);
  }
  add_header([name, value]) {
    this.context.emitter.emit("add_header", this.getFunc(name.type).call(this, name), this.getFunc(value.type).call(this, value));
  }
  set_redirect([location]) {
    this.context.emitter.emit("set_redirect", 302, this.getFunc(location.type).call(this, location));
    this.context.redirected = true;
  }
  set_response_code([code, body]) {
    if (body) {
      return this.context.emitter.emit("set_response_code", this.getFunc(code.type).call(this, code), this.getFunc(body.type).call(this, body));
    }

    this.context.emitter.emit("set_response_code", this.getFunc(code.type).call(this, code));
  }
  str([arg]) {
    const value = this.getFunc(arg.type).call(this, arg);
    return (typeof value === "undefined") ? "None" : String(value);
  }
  substr([arg1, arg2, arg3]) {
    const string = this.getFunc(arg1.type).call(this, arg1);
    if (typeof string !== "string") {
      throw new Error("substr invoked on non-string");
    }
    let startIndex;
    let length;

    if (arg2) {
      startIndex = this.getFunc(arg2.type).call(this, arg2);
    }

    if (typeof startIndex !== "number") {
      throw new Error("substr invoked with non-number as start index");
    }

    if (arg3) {
      length = this.getFunc(arg3.type).call(this, arg3);
    }

    if (length < 0) {
      length = string.length - startIndex + length;
    }
    return string.substr(startIndex, length);
  }
  time() {
    return Math.round(Date.now() / 1000);
  }
  http_time([seconds]) {
    const secondsInt = parseInt(this.getFunc(seconds.type).call(this, seconds));
    const now = new Date(secondsInt * 1000);
    return now.toUTCString();
  }
  BinaryExpression(node) {
    const left = this.getFunc(node.left.type).call(this, node.left);
    const right = this.getFunc(node.right.type).call(this, node.right);

    if (node.operator === "==") return left === castRight(left, right);
    if (node.operator === "!=") return left !== castRight(left, right);
    if (node.operator === ">=") return left >= castRight(left, right);
    if (node.operator === "<=") return left <= castRight(left, right);
    if (node.operator === "<") return left < castRight(left, right);
    if (node.operator === ">") return left > castRight(left, right);
    if (node.operator === "+") return left + right;
    if (node.operator === "-") return left - right;
    if (node.operator === "*") return left * right;
    if (node.operator === "/") return left / right;
    if (node.operator === "%") return left % right;
    if (node.operator === "has") return castString(left).indexOf(castString(right)) > -1;
    if (node.operator === "has_i") return castString(left).toLowerCase().indexOf(castString(right).toLowerCase()) > -1;
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

    throw new Error(`Unknown BinaryExpression operator ${node.operator}`);
  }
  BlockStatement(node) {
    return this.getFunc(node.body.type).call(this, node.body);
  }
  Identifier(node, nodeContext) {
    if (!nodeContext) nodeContext = this.context.assigns;
    return nodeContext[node.name];
  }
  CallExpression(node) {
    return this.getFunc(node.callee.name).call(this, node.arguments);
  }
  LogicalExpression(node) {
    const left = this.getFunc(node.left.type).bind(this);
    const right = this.getFunc(node.right.type).bind(this);

    if (node.operator === "&" || node.operator === "&&") return left(node.left) && right(node.right);
    if (node.operator === "|" || node.operator === "||") return left(node.left) || right(node.right);

    throw new Error(`Unknown BinaryExpression operator ${node.operator}`);
  }
  MemberExpression(node) {
    const object = this.getFunc(node.object.type).call(this, node.object);
    if (!object) return;

    const property = this.getFunc(node.property.type).call(this, node.property);
    if (property === undefined) return;

    return object[property];
  }
  ObjectExpression(node) {
    if (!node.properties) return {};
    return node.properties.reduce((obj, property) => {
      obj[property.key.name] = this.getFunc(property.value.type).call(this, property.value);
      return obj;
    }, {});
  }
  ArrayExpression(node) {
    if (!node.elements) return [];
    return node.elements.map((elm) => this.getFunc(elm.type).call(this, elm));
  }
  Literal(node) {
    return node.value;
  }
  UnaryExpression(node) {
    if (node.operator !== "!") {
      throw new Error(`Unary operator ${node.operator} not implemented`);
    }

    return !this.getFunc(node.argument.type).call(this, node.argument);
  }
  getFunc(name) {
    if (!this[name]) throw new Error(`${name} is not implemented`);
    return this[name];
  }
}

module.exports = function evaluate(ast, context) {
  const evaluator = new Evaluator(context);
  return evaluator.getFunc(ast.type).call(evaluator, ast);
};

function castRight(left, right) {
  switch (typeof left) {
    case "string":
      return `${right}`;
    case "boolean":
      if (right === "false") return false;
      if (right === "true") return true;
      break;
    case "number":
      return Number(right);
  }
  return right;
}

function castString(any) {
  return typeof any === "undefined" ? "" : String(any);
}
