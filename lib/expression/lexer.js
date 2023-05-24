/* eslint-disable prefer-template */

"use strict";

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

const {
  ARRAY,
  BINARY,
  BLOCK,
  BOOLEAN,
  ENDMARK,
  FUNCTION,
  IDENTIFIER,
  IDENTIFIER_CHARS,
  LITERAL,
  LOGICAL,
  MEMBER,
  NUMBER,
  OBJECT,
  UNARY,
  WHITESPACE,
} = require("./types");

class EsiSyntaxError extends SyntaxError {
  constructor(message, source, column) {
    super(message);
    this.columnNumber = column;
    this.source = source;
    // console.error(message, source, column);
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

module.exports = { Lexer };
