'use strict';

var stream = require('stream');
var HTMLStream = require('@bonniernews/atlas-html-stream');
var crypto = require('crypto');
var ent = require('ent');
var events = require('events');
var request = require('got');

/* eslint-disable camelcase */


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
  html_decode([ arg ]) {
    const string = this.execute(arg.type, arg);
    if (!string) return "";

    return ent.decode(string);
  }
  digest_md5([ arg ]) {
    const string = this.execute(arg.type, arg);
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
  url_encode([ arg ]) {
    const string = this.execute(arg.type, arg);
    if (!string) {
      return "";
    }
    return encodeURIComponent(string);
  }
  add_header([ name, value ]) {
    this.context.emitter.emit("add_header", this.execute(name.type, name), this.execute(value.type, value));
  }
  set_redirect([ location ]) {
    this.context.emitter.emit("set_redirect", 302, this.execute(location.type, location));
    this.context.redirected = true;
  }
  set_response_code([ code, body ]) {
    if (body) {
      return this.context.emitter.emit("set_response_code", this.execute(code.type, code), this.execute(body.type, body));
    }

    this.context.emitter.emit("set_response_code", this.execute(code.type, code));
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
    if (typeof string !== "string") {
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

function evaluate(ast, context) {
  return new Evaluator(context).execute(ast.type, ast);
}

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

const ARRAY = "ArrayExpression";
const BINARY = "BinaryExpression";
const BLOCK = "BlockStatement";
const BOOLEAN = "Boolean";
const ENDMARK = "EOL";
const EXPRESSION = "Expression";
const FUNCTION = "CallExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";
const LOGICAL = "LogicalExpression";
const MEMBER = "MemberExpression";
const NUMBER = "Number";
const OBJECT = "ObjectExpression";
const UNARY = "UnaryExpression";
const WHITESPACE = "Space";
const IDENTIFIER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

/* eslint-disable prefer-template */


const oneCharacterSymbols = "=()<>|*+-&{}/%,]:";
const twoCharacterSymbols = [
  "==",
  "!=",
  ">=",
  "<=",
  "||",
  "&&",
];

const keywords = [ "matches", "matches_i", "has", "has_i" ];

const NUMBERS = "0123456789";
const NUMBER_STARTCHARS = `-${NUMBERS}`;
const NUMBER_CHARS = NUMBER_STARTCHARS + ".";

class EsiSyntaxError extends SyntaxError {
  constructor(message, source, column) {
    super(message);
    this.columnNumber = column;
    this.source = source;
    Error.captureStackTrace(this, EsiSyntaxError);
  }
}

class Scanner {
  constructor(str) {
    this.str = str;
    this.l = str.length;
    this.column = -1;
  }
  get() {
    const str = this.str;
    const l = this.l;
    const idx = ++this.column;
    const c = str[idx];
    const c2 = (idx + 1) < l ? c + str[idx + 1] : undefined;
    const c3 = (idx + 2) < l ? c2 + str[idx + 2] : undefined;
    return { column: idx, c, c2, c3 };
  }
}

class Token {
  constructor(parent, startChar, columnOffset = 0, line = 1) {
    this.parent = parent;
    this.startChar = startChar;
    this.columnOffset = columnOffset;
    this.line = line;
    const { column, c: cargo } = startChar;
    this.column = column;
    this.cargo = cargo;
    this.loc = {
      start: {
        line,
        column,
      },
    };
  }
  abort(...args) {
    this.parent.abort(this.column, ...args);
  }
  end(source, endColumn) {
    this.loc.source = source;
    this.loc.start.column += this.columnOffset;
    this.loc.end = {
      line: this.line,
      column: endColumn + this.columnOffset,
    };
  }
  get() {
    switch (this.type) {
      case BLOCK: {
        return {
          type: this.type,
          loc: this.loc,
        };
      }
      case BOOLEAN: {
        return {
          type: LITERAL,
          value: this.cargo === "true",
          loc: this.loc,
        };
      }
      case IDENTIFIER: {
        return {
          type: this.type,
          name: this.cargo,
          loc: this.loc,
        };
      }
      case LITERAL: {
        return {
          type: this.type,
          value: this.cargo,
          loc: this.loc,
        };
      }
      case NUMBER: {
        return {
          type: LITERAL,
          value: Number(this.cargo),
          loc: this.loc,
        };
      }
      case MEMBER: {
        return {
          type: this.type,
          object: {
            type: "Identifier",
            name: this.cargo,
          },
          loc: this.loc,
        };
      }
      case FUNCTION: {
        return {
          type: this.type,
          callee: {
            type: "Identifier",
            name: this.cargo,
          },
          arguments: [],
          loc: this.loc,
        };
      }
      case ARRAY: {
        return {
          type: this.type,
          elements: [],
          loc: this.loc,
        };
      }
      case OBJECT: {
        return {
          type: this.type,
          loc: this.loc,
        };
      }
      case UNARY: {
        return {
          type: this.type,
          operator: this.cargo,
          prefix: true,
          loc: this.loc,
        };
      }
      case "&":
      case "&&":
      case "|":
      case "||": {
        return {
          type: LOGICAL,
          operator: this.cargo,
          loc: this.loc,
        };
      }
      case "matches":
      case "matches_i":
      case "has":
      case "has_i":
      case "*":
      case "/":
      case "+":
      case "%":
      case "-":
      case "<":
      case ">":
      case "!=":
      case ">=":
      case "<=":
      case "==": {
        return {
          type: BINARY,
          operator: this.cargo,
          loc: this.loc,
        };
      }
      default:
        return {
          type: this.type,
          cargo: this.cargo,
          loc: this.loc,
        };
    }
  }
}

class Lexer {
  constructor(str, columnOffset, line) {
    this.str = str;
    this.scanner = new Scanner(str);
    this.columnOffset = columnOffset;
    this.line = line;
    this.column = -1;
    this.char = null;
    this.c1 = null;
    this.c2 = null;
    this.c3 = null;
    this.source = "";
    this.getChar();
  }
  getChar() {
    if (this.c1) this.source += this.c1;

    const char = this.char = this.scanner.get();
    this.column = char.column;
    this.c1 = char.c;
    this.c2 = char.c2;
    this.c3 = char.c3;
    return char;
  }
  consumeWhitespace(token) {
    token.type = WHITESPACE;
    token.cargo = this.c1;
    this.getChar();
    return this.next();
  }
  consumeFunction(token) {
    token.type = FUNCTION;
    let c = this.getChar().c;
    if (c === "(") {
      token.type = IDENTIFIER;
      c = this.getChar().c;
    }

    token.cargo = "";

    while (IDENTIFIER_CHARS.indexOf(c) > -1) {
      token.cargo += c;
      c = this.getChar().c;
    }

    if (token.type === IDENTIFIER && c === "{") {
      token.type = MEMBER;
    } else if (token.type === FUNCTION) {
      if (c !== "(") return this._abort(this.column, "Unexpected", c ? "char " + c : "end of line");
    } else if (token.type === IDENTIFIER) {
      if (c !== ")") return this._abort(this.column, "Unexpected", c ? "char " + c : "end of line");
    }

    this.getChar();
    return this.next();
  }
  consumeSingleQuoute(token) {
    let quoteChars = this.c1;
    token.cargo = "";
    token.type = LITERAL;
    let c3 = this.c3;
    if (c3 === "'''") {
      quoteChars = "'''";

      this.getChar();
      this.getChar();
      c3 = this.getChar().c3;

      while (c3 !== "'''") {
        if (c3 === undefined) this._abort(this.column, "Found end of file before end of string literal");
        token.cargo += this.c1;
        c3 = this.getChar().c3;
      }

      this.getChar();
      this.getChar();
      this.getChar();
    } else {
      let c = this.getChar().c;

      while (c !== quoteChars) {
        if (c === undefined) this._abort(this.column, "Found end of file before end of string literal");
        else if (c === "\\") {
          c = this.getChar().c;
        }

        token.cargo += c;
        c = this.getChar().c;
      }

      this.getChar();
    }

    return this.next(quoteChars, token.cargo, quoteChars);
  }
  consumeNumber(token) {
    token.cargo = "";
    token.type = NUMBER;

    let c = this.c1;
    while (NUMBER_CHARS.indexOf(c) > -1) {
      token.cargo += c;
      c = this.getChar().c;
    }

    return this.next();
  }
  consumeArray(token) {
    token.type = ARRAY;
    token.cargo = this.c1;
    this.getChar();
    return this.next();
  }
  consumeObject(token) {
    token.type = OBJECT;
    token.cargo = this.c1;
    this.getChar();
    return this.next();
  }
  consumeBlock(token) {
    token.type = BLOCK;
    token.cargo = this.c1;
    this.getChar();
    return this.next();
  }
  consumeTwoCharacters(token) {
    const c2 = this.c2;
    token.cargo = c2;
    token.type = c2;

    if (this.c3 === undefined || this.column === 0) return this.unexpectedToken(c2);

    this.getChar();
    this.getChar();
    return this.next();
  }
  consumeUnary(token) {
    token.cargo = this.c1;
    token.type = UNARY;

    const c = this.getChar().c;
    if (c === "(" || c === "$") {
      return this.next();
    }

    return this.unexpectedToken(token.cargo);
  }
  consumeOneCharacter(token) {
    const c1 = this.c1;
    token.cargo = c1;
    token.type = c1;

    if (c1 === "|" && (this.c2 === undefined || this.column === 0)) return this.unexpectedToken("|");

    this.getChar();
    return this.next();
  }
  consumeIdentifier(token) {
    token.cargo = "";

    let c = this.c1;
    while (IDENTIFIER_CHARS.indexOf(c) > -1) {
      token.cargo += c;
      c = this.getChar().c;
    }

    if (token.cargo === "true") {
      token.type = BOOLEAN;
      return this.next();
    }

    if (token.cargo === "false") {
      token.type = BOOLEAN;
      return this.next();
    }

    if (keywords.indexOf(token.cargo) === -1) {
      return this._abort(token.column, `Unknown keyword "${token.cargo}"`);
    }

    token.type = token.cargo;
    return this.next();
  }
  get() {
    const token = this.token = new Token(this, this.char, this.columnOffset, this.line);
    const c1 = this.c1;
    if (c1 === undefined) {
      token.type = ENDMARK;
      return this.next();
    }

    switch (c1) {
      case " ":
        return this.consumeWhitespace(token);
      case "$":
        return this.consumeFunction(token);
      case "'":
        return this.consumeSingleQuoute(token);
      case "[":
        return this.consumeArray(token);
      case "{":
        return this.consumeObject(token);
      case "(":
        return this.consumeBlock(token);
    }

    if (NUMBER_STARTCHARS.indexOf(c1) > -1 && this.c2 !== "- ") {
      return this.consumeNumber(token);
    }

    if (twoCharacterSymbols.indexOf(this.c2) > -1) {
      return this.consumeTwoCharacters(token);
    }

    if (c1 === "!") {
      return this.consumeUnary(token);
    }

    if (oneCharacterSymbols.indexOf(c1) > -1) {
      return this.consumeOneCharacter(token);
    }

    if (IDENTIFIER_CHARS.indexOf(c1) > -1) {
      return this.consumeIdentifier(token);
    }

    return this.unexpectedToken(c1);
  }
  next() {
    let c = this.c1;
    while (c === " ") {
      c = this.getChar().c;
    }
    this.token.end(this.source, this.column);
    this.source = "";
    return this.token;
  }
  unexpectedToken(c) {
    return this._abort(this.column, `Unexpected token "${c}"`);
  }
  abort(...args) {
    this._abort(this.column, ...args);
  }
  _abort(column, ...args) {
    args.push(`at "${this.str}" 0:${column}`);
    const err = new EsiSyntaxError(args.join(" "), this.str, column);
    throw err;
  }
}

/* eslint-disable prefer-template */


class AST {
  constructor() {
    const expression = this.expression = {
      type: EXPRESSION,
      body: {},
    };
    this.stack = [ expression ];
  }
  get tree() {
    while (this.stack.length > 1) {
      this.doClose(this.stack.pop(), this.getLast());
    }
    return this.expression.body;
  }
  openNode(node) {
    const current = this.getLast();
    this.stack.push(node);

    switch (node.type) {
      case BINARY:
      case LOGICAL:
        this.switchLeft(current, node);
        break;
      case UNARY:
        if (current.type === EXPRESSION) current.body = node;
        break;
    }
  }
  switchLeft(current, node) {
    switch (current && current.type) {
      case BLOCK:
      case EXPRESSION: {
        node.left = current.body;
        current.body = node;
        break;
      }
      case LOGICAL: {
        node.left = current.right;
        current.right = node;
        break;
      }
      case FUNCTION: {
        const left = current.arguments.pop();
        node.left = left;
        current.arguments.push(node);
        break;
      }
    }
  }
  doClose(node, current) {
    current = current || this.getLast();

    switch (node.type) {
      case LOGICAL:
      case BINARY: {
        node.loc.source = node.left.loc.source + node.loc.source + node.right.loc.source;
        node.loc.start = { ...node.left.loc.start };
        node.loc.end = { ...node.right.loc.end };
        break;
      }
      case UNARY: {
        node.loc.source = node.loc.source + node.argument.loc.source;
        node.loc.end = { ...node.argument.loc.end };
        break;
      }
    }

    if (current === node) return;

    switch (current && current.type) {
      case BINARY: {
        current.right = node;
        this.closeNode(current);
        break;
      }
      case LOGICAL:
        current.right = node;
        break;
      case BLOCK: {
        current.body = node;
        break;
      }
      case EXPRESSION: {
        current.body = node;
        break;
      }
      case UNARY: {
        current.argument = node;
        this.closeNode(current);
        break;
      }
      case ARRAY: {
        this.addArrayElement(current, node);
        break;
      }
      case FUNCTION: {
        if (node.type === BINARY) break;
        this.addFunctionArgument(current, node);
        break;
      }
    }
  }
  closeNode(node) {
    this.stack.pop();
    const current = this.getLast();

    this.doClose(node, current);
  }
  getLast() {
    return this.stack[this.stack.length - 1] || this.expression.body;
  }
  addArrayElement(current, node) {
    const lastIdx = current.elements.length - 1;
    if (lastIdx > -1) {
      const lastElm = current.elements[lastIdx];
      if (node.type === ",") {
        if (lastElm.type === ",") throw new SyntaxError(`Unexpected ${node.type} in ${current.type}`);
        current.elements.push(node);
      } else {
        if (lastElm.type !== ",") throw new SyntaxError(`Unexpected ${node.type} in ${current.type}`);
        current.elements[lastIdx] = node;

        node.loc.source = lastElm.loc.source + node.loc.source;
        node.loc.start = { ...lastElm.loc.start };
      }
    } else {
      current.elements.push(node);
    }
  }
  addFunctionArgument(current, node) {
    const lastIdx = current.arguments.length - 1;
    if (lastIdx > -1) {
      const lastArg = current.arguments[lastIdx];
      if (node.type === ",") {
        if (lastArg.type === ",") throw new SyntaxError(`Unexpected ${node.type} in ${current.type}`);
        current.arguments.push(node);
      } else {
        if (lastArg.type !== ",") throw new SyntaxError(`Unexpected ${node.type} in ${current.type}`);
        current.arguments[lastIdx] = node;

        node.loc.source = lastArg.loc.source + node.loc.source;
        node.loc.start = { ...lastArg.loc.start };
      }
    } else {
      current.arguments.push(node);
    }
  }
}

class Parser {
  constructor(sourceText, ast, columnOffset, line) {
    this.source = sourceText;
    this.lexer = new Lexer(sourceText, columnOffset, line);
    this.ast = ast;
    this.token = null;
  }
  consume() {
    const token = this.lexer.get();
    if (token.type === ENDMARK) return;

    const node = token.get();

    switch (node.type) {
      case BINARY:
      case LOGICAL:
      case UNARY: {
        this.openNode(node);
        break;
      }
      case ARRAY: {
        this.openNode(node);
        node.elements = [];

        let elm;
        elm = this.consume();

        while (elm && elm.type !== "]") {
          if (elm.type === ",") return this.lexer.abort("Unexpected", elm.type, "in", node.type);

          elm = this.consume();
          if (!elm) break;

          if (elm.type === ",") {
            elm = this.consume();
          } else if (elm.type !== "]") return this.lexer.abort("Unexpected", elm.type, "in", node.type);
        }

        if (!elm || elm.type !== "]") return this.lexer.abort("Unclosed", node.type);

        for (const a of node.elements) {
          node.loc.source += a.loc.source;
        }

        node.loc.source += elm.loc.source;
        node.loc.end = { ...elm.loc.end };

        this.closeNode(node);
        break;
      }
      case BLOCK: {
        this.openNode(node);
        const source = node.loc.source;

        let arg = this.consume();
        while (arg && arg.type !== ")") {
          arg = this.consume();
        }

        if (!arg || arg.type !== ")") return this.lexer.abort("Unclosed", node.type);

        node.loc.source = source + node.body.loc.source + arg.loc.source;
        node.loc.end = arg.loc.end;

        this.closeNode(node);
        break;
      }
      case WHITESPACE: {
        return this.consume();
      }
      case FUNCTION: {
        this.openNode(node);

        let arg = this.consume();
        if (arg && arg.type === ",") return this.lexer.abort("Unexpected", arg.type, "in", node.type);

        while (arg && arg.type !== ")") {
          arg = this.consume();
        }
        if (!arg || arg.type !== ")") return this.lexer.abort("Unclosed", node.type);

        for (const a of node.arguments) {
          node.loc.source += a.loc.source;
        }

        node.loc.source += arg.loc.source;
        node.loc.end = { ...arg.loc.end };

        this.closeNode(node);
        break;
      }
      case IDENTIFIER: {
        this.openNode(node);
        this.closeNode(node);
        break;
      }
      case LITERAL: {
        this.openNode(node);
        this.closeNode(node);
        break;
      }
      case MEMBER: {
        let prop;
        this.openNode(node);

        do {
          node.property = prop;
          prop = this.consume();
          if (!prop) continue;
          node.loc.source += prop.loc.source;
        } while (prop && prop.type !== "}");

        const end = this.consume();
        if (!end || end.type !== ")") return this.lexer.abort("Unclosed", node.type);

        node.loc.source += end.loc.source;
        node.loc.end = end.loc.end;
        this.closeNode(node);

        break;
      }
      case OBJECT: {
        this.openNode(node);
        node.properties = [];

        let prop = this.consume();
        this.addObjectProperty(node, null, prop);

        while (prop && prop.type !== "}") {
          prop = this.consume();
          if (prop && prop.type === ",") {
            this.addObjectProperty(node, prop, this.consume());
          }
        }
        if (!prop || prop.type !== "}") return this.lexer.abort("Unclosed", node.type);

        for (const a of node.properties) {
          node.loc.source += a.loc.source;
        }

        node.loc.source += prop.loc.source;
        node.loc.end = prop.loc.end;

        this.closeNode(node);
        break;
      }
      case ",":
        this.openNode(node);
        this.closeNode(node);
        break;
    }

    return node;
  }
  openNode(node) {
    try {
      this.ast.openNode(node);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      const start = node.loc.start;
      throw new SyntaxError(`${err.message} at "${this.source}" ${start.line}:${start.column}`);
    }
  }
  closeNode(node) {
    try {
      this.ast.closeNode(node);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      const start = node.loc.start;
      throw new SyntaxError(`${err.message} at "${this.source}" ${start.line}:${start.column}`);
    }
  }
  addObjectProperty(objectNode, commaNode, keyNode) {
    if (keyNode && keyNode.type === "}") return;
    if (!keyNode) return this.lexer.abort("Unclosed", OBJECT);
    if (keyNode.type !== LITERAL) return this.lexer.abort("Unexpected key", keyNode.type);

    const colon = this.consume();
    if (!colon) return this.lexer.abort("Missing key value separator");
    if (colon.type !== ":") return this.lexer.abort("Unexpected", colon.type, "in object");

    const value = this.consume();
    const property = {
      type: "Property",
      key: {
        type: IDENTIFIER,
        name: keyNode.value,
      },
      value,
      loc: {
        source: [ commaNode, keyNode, colon, value ]
          .filter(Boolean)
          .map((n) => n.loc.source)
          .join(""),
        start: { ...((commaNode || keyNode).loc.start) },
        end: { ...value.loc.end },
      },
    };

    objectNode.properties.push(property);
  }
}

function parse$1(input, columnOffset) {
  if (!input) return;
  input = input.trim();

  const ast = new AST(columnOffset);
  const parser = new Parser(input, ast, columnOffset);
  while ((parser.consume())) {
    // No-op
  }

  return ast.tree;
}

function split(input) {
  const lines = input.split("\n");

  return lines.reduce((result, str, idx) => {
    let columnOffset = 0;
    let match;

    while ((match = str.match(/(?<!\\)\$(.*)/))) {
      const line = idx + 1;
      columnOffset += match.index;

      if (match.index > 0) {
        result.push({ type: "TEXT", text: str.substring(0, match.index) });
      }

      const ast = new AST();
      const parser = new Parser(match[0], ast, columnOffset, line);
      const hit = { expression: parser.consume() };
      result.push(hit);

      const hitSourceLength = hit.expression.loc.source.trim().length;
      columnOffset += hitSourceLength;

      str = str.substring(match.index + hitSourceLength);
    }

    if (lines.length > 1 && idx < lines.length - 1) {
      str += "\n";
    }
    if (str) {
      result.push({ type: "TEXT", text: str });
    }

    return result;
  }, []);
}

function assign(value, context) {
  if (value === "true" || value === "false") return value;
  return evaluate(parse$1(value), context);
}

function test(expression, context) {
  return evaluate(parse$1(expression), context);
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

  text = text.replace(/(^|[^\\])(\\)($|[^\\])/ig, (_, group1, _2, group3) => { // Remove backslashes, but not escaped ones
    return `${group1}${group3}`;
  });

  text = text.replace(/\\\\/g, "\\"); // Escaped backslashes, remove the escaping backslash

  return text;
}

class ESIBase extends stream.Transform {
  constructor(evaluator) {
    super({ objectMode: true });
    this.evaluator = evaluator;
    this.context = evaluator.context;
  }
  _transform({ name, data, text }, encoding, next) {
    if (text) {
      return this.evaluator.ontext(text, next);
    } else if (name && data) {
      return this.evaluator.onopentag(name, data, next);
    } else {
      return this.evaluator.onclosetag(name, next);
    }
  }
}

/* eslint-disable no-use-before-define */

class ESITag {
  constructor(context) {
    this.context = context;
  }
  open(data, next) {
    next();
  }
  close(next) {
    next();
  }
}

class ESITry extends ESITag {
  constructor(...args) {
    super(...args);
    this.children = [];
  }
  assertChild(name) {
    this.children.push(name);
    if (![ "esi:attempt", "esi:except" ].includes(name)) {
      throw new Error(`${name} is not allowed inside an esi:try`);
    }
  }
  close(next) {
    if (!this.children.includes("esi:attempt")) {
      return next(new Error("esi:try without esi:attempt not allowed"));
    }
    this.children.length = 0;
    next();
  }
}

class ESIAttempt extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:attempt is not allowed outside esi:try");
    }
  }
  open(data, next) {
    this.context.inAttempt = true;
    next();
  }
}

class ESIExcept extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:except is not allowed outside esi:try");
    }
  }
  open(data, next) {
    this.context.inExcept = true;
    next();
  }
  close(next) {
    this.context.inExcept = false;
    next();
  }
}

class ESIChoose extends ESITag {
  constructor(...args) {
    super(...args);
    this.children = [];
  }
  assertChild(name) {
    this.children.push(name);
    if (![ "esi:when", "esi:otherwise" ].includes(name)) {
      throw new Error(`${name} is not allowed inside a esi:choose`);
    }
  }
  open(data, next) {
    this.context.chooses.push({ testMatched: false, chosen: false });
    return next();
  }
  close(next) {
    if (!this.children.includes("esi:when")) {
      return next(new Error("esi:choose without esi:when not allowed"));
    }
    this.children.length = 0;
    this.context.chooses.pop();
    return next();
  }
}

class ESIWhen extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:when is not allowed outside esi:choose");
    }
  }
  open(data, next) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];

    let result;
    try {
      result = test(data.test, context);
    } catch (err) {
      return next(err);
    }

    if (lastChoose.testMatched) {
      lastChoose.chosen = false;
      return next();
    }

    if (data.matchname) {
      context.assigns[data.matchname] = result;
    }

    lastChoose.testMatched = lastChoose.chosen = !!result;

    return next();
  }
}

class ESIOtherwise extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:otherwise is not allowed outside esi:choose");
    }
  }
  open(data, next) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];
    lastChoose.chosen = !lastChoose.testMatched;
    return next();
  }
}

class ESIText extends ESITag {
  get plainText() {
    return true;
  }
}

class ESIAssign extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) {
      return next();
    }

    const value = data.value;
    try {
      context.assigns[data.name] = assign(value, context);
    } catch (err) {
      if (/unknown keyword/i.test(err.message)) context.assigns[data.name] = value;
      else return next(err);
    }

    next();
  }
}

class ESIBreak extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.inForeach) return next(new Error("esi:break outside esi:foreach"));
    context.breakHit = context.breakHit || context.shouldWrite();
    return context.breakHit ? next(null, { name: "esi:break" }) : next();
  }
}

class ESIEval extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) return next();

    const chunks = [];
    stream.pipeline([
      context.fetch(data),
      new HTMLStream({ preserveWS: true }),
      new ESIBase(new ESIEvaluator(context.clone(true))),
    ], (err) => {
      if (err) {
        if (err.inAttempt) return next();
        return next(err);
      }
      return context.writeToResult(chunks, next);
    }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIInclude extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) return next();

    const chunks = [];
    const streams = [
      context.fetch(data),
      new HTMLStream({ preserveWS: true }),
    ];
    if (data.dca === "esi") {
      streams.push(new ESIBase(new ESIEvaluator(context.clone())));
    }
    stream.pipeline(streams, (err) => {
      if (err) {
        if (err.inAttempt) return next();
        return next(err);
      }
      return context.writeToResult(chunks, next);
    }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIForEach extends ESITag {
  open(data, next) {
    const context = this.context;
    context.items = assign(data.collection, context);
    if (!Array.isArray(context.items)) {
      context.items = Object.entries(context.items);
    }
    context.itemVariableName = data.item || "item";

    context.foreachChunks = [];
    return next();
  }
  close(next) {
    const context = this.context;
    const foreachChunks = context.foreachChunks;
    delete context.foreachChunks;

    let buffered = [];

    for (let value of context.items) {
      if (Array.isArray(value)) value = `[${value.map((v) => typeof v === "string" ? `'${v}'` : v).join(",")}]`;

      buffered = buffered.concat([ { name: "esi:assign", data: { name: context.itemVariableName, value: value.toString() } }, { name: "esi:assign" } ], foreachChunks);
    }

    const localContext = context.subContext();
    localContext.inForeach = true;
    const chunks = [];

    stream.pipeline([
      stream.Readable.from(buffered),
      new ESIBase(new ESIEvaluator(localContext)),
    ], (err) => {
      if (err) return next(err);
      return context.writeToResult(chunks, next);
    }).on("data", function onData(chunk) {
      if (chunk.name === "esi:break") {
        this.pause();
        return process.nextTick(() => this.push(null));
      }

      chunks.push(chunk);
    });
  }
}

const EsiTags = {
  "esi:assign": ESIAssign,
  "esi:attempt": ESIAttempt,
  "esi:break": ESIBreak,
  "esi:choose": ESIChoose,
  "esi:except": ESIExcept,
  "esi:otherwise": ESIOtherwise,
  "esi:text": ESIText,
  "esi:try": ESITry,
  "esi:vars": ESITag,
  "esi:when": ESIWhen,
  "esi:eval": ESIEval,
  "esi:include": ESIInclude,
  "esi:foreach": ESIForEach,
};

class ESIEvaluator {
  constructor(context) {
    this.context = context;
  }
  onopentag(name, data, next) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ name, data });
      return next();
    }

    if (name.startsWith("esi:")) {
      const Tag = EsiTags[name];
      const wasInPlainText = context.isInPlainText();
      if (!Tag && !wasInPlainText) {
        throw new Error(`ESI tag ${name} not implemented.`);
      }
      let esiFunc;
      if (Tag) esiFunc = new Tag(context);
      const tags = context.tags;
      const idx = context.tags.push(esiFunc);
      const parent = tags[idx - 2];
      if (parent?.assertChild) {
        try {
          parent.assertChild(name);
        } catch (err) {
          return next(err);
        }
      }
      if (esiFunc?.assertParent) {
        try {
          esiFunc.assertParent(parent);
        } catch (err) {
          return next(err);
        }
      }
      if (!wasInPlainText) return esiFunc.open(data, next);
    }

    context.writeToResult({ name, data: this.makeAttributes(data) }, next);
  }
  onclosetag(name, next) {
    const context = this.context;
    if (name !== "esi:foreach" && context.foreachChunks) {
      context.foreachChunks.push({ name });
      return next();
    }

    if (name.startsWith("esi:")) {
      const popped = context.tags.pop();

      if (!context.isInPlainText()) {
        if (popped && popped.close) return popped.close(next);
        return next();
      }
    }

    context.writeToResult({ name }, next);
  }
  ontext(text, next) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ text });
      return next();
    }

    if (!context.isProcessing()) {
      return context.writeToResult({ text }, next);
    }

    const current = context.tags[context.tags.length - 1];
    if (context.bufferingString && current.text) {
      text = current.text + text;
    }

    try {
      return context.writeToResult((currentContext) => {
        const result = { text: replace(text, currentContext || context) };
        context.bufferingString = false;
        return result;
      }, next); // handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.bufferingString = true;
        current.text = text;
        return next();
      }

      return next(err);
    }
  }
  makeAttributes(data) {
    if (!data) return {};

    const context = this.context;
    return Object.keys(data).reduce((attributes, key) => {
      let value = data[key];
      if (context.isProcessing()) {
        value = replace(value, context);
      }
      attributes[key] = value || "";
      return attributes;
    }, {});
  }
}

const voidElements = [ "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr" ];
const selfClosingElements = [ "esi:include", "esi:eval", "esi:assign", "esi:debug", "esi:break" ];

function chunkToMarkup({ name, data, text }) {
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
  return Object.entries(attr).reduce((attributes, [ key, value ]) => {
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

class ListenerContext {
  constructor(options = {}, emitter) {
    this.options = options;
    this.emitter = emitter || new events.EventEmitter();
    this.inAttempt = false;
    this.lastAttemptWasError = false;
    this.inExcept = false;
    this.includeError = false;
    this.replacement = "";
    this.chooses = [];
    this.tags = [];
    this.cookies = options.cookies;
    this.assigns = {
      ...buildHeaderVariables(options.headers),
      ...buildGeoSubstructures(options.headers),
      HTTP_COOKIE: options.cookies || {},
      REQUEST_PATH: options.path || {},
      QUERY_STRING: options.query || {},
    };
  }
  isProcessing() {
    return Boolean((this.tags.length || this.isSubContext) && !this.isInPlainText());
  }
  isInPlainText() {
    return this.tags.some((tag) => tag.plainText);
  }
  clone(linkAssigns) {
    const c = new ListenerContext(this.options, this.emitter);
    if (linkAssigns) {
      c.assigns = this.assigns;
    }
    return c;
  }
  subContext() {
    const clone = this.clone(true);
    clone.isSubContext = true;
    return clone;
  }
  shouldWrite() {
    if (this.inExcept && !this.lastAttemptWasError) return false;
    if (this.breakHit) return false;

    if (this.chooses.length) {
      return this.chooses.every((choose) => choose.chosen);
    }

    return true;
  }
  writeToResult(chunk, next) {
    if (this.bufferingString) {
      const [ current = {} ] = this.tags.slice(-1);
      if (typeof chunk === "function") {
        chunk = chunk();
      }

      current.text += chunkToMarkup(chunk);

      return next();
    }

    if (this.shouldWrite()) {
      if (typeof chunk === "function") {
        chunk = chunk();
      }
      return next(null, chunk);
    }

    next();
  }
  fetch(data) {
    const self = this;
    const options = {
      throwHttpErrors: false,
      method: "GET",
      retry: 0,
      headers: {
        ...self.options.headers,
        ...getAttributeHeaders(data.setheader),
        host: undefined,
        "content-type": undefined,
      },
    };

    let fetchUrl = replace(data.src, self);
    if (!fetchUrl.startsWith("http")) {
      const host = this.options.localhost || self.assigns.HTTP_HOST;
      fetchUrl = new URL(fetchUrl, `http://${host}`).toString();
    }

    return request.stream(fetchUrl, options)
      .on("response", function onResponse(resp) {
        if (resp.statusCode < 400) return;
        if (self.inAttempt) {
          self.lastAttemptWasError = true;
          return this.push(null);
        }
        return this.destroy(new request.HTTPError(resp));
      })
      .on("error", (err) => {
        if (!self.inAttempt) return;
        self.lastAttemptWasError = true;
        err.inAttempt = true;
      });

    function getAttributeHeaders(attr) {
      if (!attr) return;
      const [ key, val ] = attr.split(":");
      return { [key]: replace(val, self) };
    }
  }
}

function buildHeaderVariables(headers) {
  if (!headers) return {};
  return Object.entries(headers).reduce((acc, pair) => {
    const header = pair[0];
    if (header === "x-forwarded-for") {
      acc.REMOTE_ADDR = pair[1];
    }

    const httpKey = header.replace(/-/g, "_").toUpperCase();
    acc[`HTTP_${httpKey}`] = pair[1];
    return acc;
  }, {});
}

function buildGeoSubstructures(headers) {
  return {
    GEO: headers?.["x-localesi-geo"]
      ? JSON.parse(headers["x-localesi-geo"])
      : {
        country_code: "SE",
        georegion: 208,
      },
  };
}

class ESI extends ESIBase {
  constructor(options) {
    const evaluator = new ESIEvaluator(new ListenerContext(options));
    super(evaluator);
    this.context.emitter = this;
  }
}

class HTMLWriter extends stream.Transform {
  constructor() {
    super({ writableObjectMode: true });
  }
  _transform(chunks, encoding, next) {
    if (!chunks) return next();
    chunks = Array.isArray(chunks) ? chunks : [ chunks ];
    let markup = "";
    for (const chunk of chunks) {
      markup += chunkToMarkup(chunk);
    }
    return next(null, markup);
  }
}

function parse(html, options) {
  const response = {};

  let body = "";

  const esi = new ESI(options)
    .on("set_response_code", onSetResponseCode)
    .on("add_header", onAddHeader)
    .once("set_redirect", onRedirect);

  return new Promise((resolve, reject) => {
    stream.pipeline([
      stream.Readable.from(html),
      new HTMLStream({ preserveWS: true }),
      esi,
      new HTMLWriter(),
    ], (err) => {
      if (err && ![ "ERR_STREAM_DESTROYED", "ERR_STREAM_PREMATURE_CLOSE" ].includes(err.code)) return reject(err);
      resolve({
        body,
        ...response,
      });
    }).on("data", (chunk) => {
      body += chunk;
    });
  });

  function onRedirect(statusCode, location) {
    response.statusCode = statusCode;
    if (location) {
      response.headers = response.headers || {};
      response.headers.location = location;
    }
    this.destroy();
  }

  function onAddHeader(name, value) {
    const headers = response.headers = response.headers || {};
    const lname = name.toLowerCase();
    if (lname === "set-cookie") {
      headers[lname] = headers[lname] || [];
      headers[lname].push(value);
    } else {
      headers[lname] = value;
    }
  }

  function onSetResponseCode(statusCode, withBody) {
    response.statusCode = statusCode;
    if (!withBody) return;
    response.body = withBody;
    this.destroy();
  }
}

exports.ESI = ESI;
exports.HTMLWriter = HTMLWriter;
exports.parse = parse;
