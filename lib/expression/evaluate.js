/* eslint-disable camelcase */
"use strict";
const CryptoJS = require("crypto-js");

class CustomEvent extends Event {
  constructor(event, { detail }) {
    super(event);
    this.detail = detail;
  }
}

class Evaluator {
  constructor(context) {
    this.context = context;
  }
  exists([ arg ]) {
    return !!this.execute(arg.type, arg);
  }
  int([ arg ]) {
    return parseInt(this.execute(arg.type, arg)) || 0;
  }
  index([ arg1, arg2 ]) {
    return this.execute(arg1.type, arg1).indexOf(this.execute(arg2.type, arg2));
  }
  base64_decode([ arg ]) {
    const string = this.execute(arg.type, arg);
    if (!string) {
      return "";
    }
    return Buffer.from(string, "base64").toString("utf8");
  }
  base64_encode([ arg ]) {
    const string = this.execute(arg.type, arg);
    if (!string) {
      return "";
    }
    return Buffer.from(string, "utf8").toString("base64");
  }
  digest_md5([ arg ]) {
    const string = this.execute(arg.type, arg);
    // console.log(`digest_md5("${string}")`);
    if (!string) {
      return [];
    }

    // const crypto = require("crypto");
    // const md5 = crypto.createHash("md5").update(string).digest();
    // console.log("md5", md5);
    // md5 <Buffer c6 8a 36 27 2a 71 4f 29 7a 4a be a5 15 82 a8 06>
    // const esihash = [];
    // for (let offset = 0; offset < 16; offset += 4) {
    //   esihash.push(md5.readInt32LE(offset));
    // }
    // return esihash;

    /* eslint-disable-next-line new-cap */
    const md5 = CryptoJS.MD5(string);
    // console.log("md5", md5);
    const esihash = [
      swap_endianness(md5.words[0]),
      swap_endianness(md5.words[1]),
      swap_endianness(md5.words[2]),
      swap_endianness(md5.words[3]),
    ];
    // console.log("esihash", esihash);
    return esihash;
    // CrytoJS is big-endian, but we want little-endian
    function swap_endianness(int) {
      return ((int & 0xFF) << 24)
             | ((int & 0xFF00) << 8)
             | ((int >> 8) & 0xFF00)
             | ((int >> 24) & 0xFF);
    }
  }
  url_encode([ arg ]) {
    const string = this.execute(arg.type, arg);
    if (!string) {
      return "";
    }
    return encodeURIComponent(string);
  }
  add_header([ name, value ]) {
    // console.log(`in evaluate add_header name=${this.execute(name.type, name)} value=${this.execute(value.type, value)}`);
    // console.log("in evaluate add_header this.context.emitter=", this.context.emitter);
    // console.log("in evaluate add_header about to call dispatchEvent");
    this.context.emitter.dispatchEvent(
      new CustomEvent(
        "add_header",
        {
          detail: {
            name: this.execute(name.type, name),
            value: this.execute(value.type, value),
          },
        }
      )
    );
    // console.log("in evaluate add_header called dispatchEvent");
  }
  set_redirect([ location ]) {
    this.context.emitter.dispatchEvent(
      new CustomEvent(
        "set_redirect",
        {
          detail: {
            statusCode: 302,
            location: this.execute(location.type, location),
          },
        }
      )
    );
    this.context.redirected = true;
  }
  set_response_code([ code, body ]) {
    if (body) {
      return this.context.emitter.dispatchEvent(
        new CustomEvent(
          "set_response_code",
          {
            detail: {
              statusCode: this.execute(code.type, code),
              withBody: this.execute(body.type, body),
            },
          }
        )
      );
    }

    this.context.emitter.dispatchEvent(
      new CustomEvent(
        "set_response_code",
        { detail: { statusCode: this.execute(code.type, code) } }
      )
    );
  }
  str([ arg ]) {
    const value = this.execute(arg.type, arg);
    return (typeof value === "undefined") ? "None" : String(value);
  }
  string_split([ arg1, arg2 ]) {
    const stringToSplit = this.execute(arg1.type, arg1);
    const splitBy = this.execute(arg2.type, arg2);
    if (typeof stringToSplit !== "string" || typeof splitBy !== "string") {
      throw new Error("string_split requires two arguments of type string");
    }
    return stringToSplit.split(splitBy);
  }
  substr([ arg1, arg2, arg3 ]) {
    const string = this.execute(arg1.type, arg1);
    // console.log("substr typeof string", typeof string);
    if (typeof string !== "string") {
      // console.log("substr invoked on non-string!!!");
      throw new Error("substr invoked on non-string");
    }
    let startIndex;
    let length;

    if (arg2) {
      startIndex = this.execute(arg2.type, arg2);
    }

    if (typeof startIndex !== "number") {
      throw new Error("substr invoked with non-number as start index");
    }

    if (arg3) {
      length = this.execute(arg3.type, arg3);
    }

    if (length < 0) {
      length = string.length - startIndex + length;
    }
    return string.substr(startIndex, length);
  }
  time() {
    return Math.round(Date.now() / 1000);
  }
  http_time([ seconds ]) {
    const secondsInt = parseInt(this.execute(seconds.type, seconds));
    const now = new Date(secondsInt * 1000);
    return now.toUTCString();
  }
  BinaryExpression(node) {
    const left = this.execute(node.left.type, node.left);
    const right = this.execute(node.right.type, node.right);

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
    return this.execute(node.body.type, node.body);
  }
  Identifier(node, nodeContext) {
    if (!nodeContext) nodeContext = this.context.assigns;
    return nodeContext[node.name];
  }
  CallExpression(node) {
    return this.execute(node.callee.name, node.arguments);
  }
  LogicalExpression(node) {
    const left = this.execute(node.left.type, node.left);
    const right = this.execute(node.right.type, node.right);

    if (node.operator === "&" || node.operator === "&&") return left && right;
    if (node.operator === "|" || node.operator === "||") return left || right;

    throw new Error(`Unknown BinaryExpression operator ${node.operator}`);
  }
  MemberExpression(node) {
    const object = this.execute(node.object.type, node.object);
    if (!object) return;

    const property = this.execute(node.property.type, node.property);
    if (property === undefined) return;

    return object[property];
  }
  ObjectExpression(node) {
    if (!node.properties) return {};
    return node.properties.reduce((obj, property) => {
      obj[property.key.name] = this.execute(property.value.type, property.value);
      return obj;
    }, {});
  }
  ArrayExpression(node) {
    if (!node.elements) return [];
    return node.elements.map((elm) => this.execute(elm.type, elm));
  }
  Literal(node) {
    return node.value;
  }
  UnaryExpression(node) {
    if (node.operator !== "!") {
      throw new Error(`Unary operator ${node.operator} not implemented`);
    }

    return !this.execute(node.argument.type, node.argument);
  }
  execute(name, ...args) {
    if (!this[name]) throw new Error(`${name} is not implemented`);
    const fn = this[name];
    return fn.call(this, ...args);
  }
}

module.exports = function evaluate(ast, context) {
  return new Evaluator(context).execute(ast.type, ast);
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
