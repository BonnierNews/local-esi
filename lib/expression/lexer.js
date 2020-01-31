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

const keywords = ["matches", "matches_i", "has", "has_i"];

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

module.exports = {
  Lexer,
  Scanner,
  Token,
};

function Lexer(str, columnOffset, line) {
  const scanner = Scanner(str);

  let column, char, c1, c2, c3, source = "";
  getChar();

  return {
    get,
  };

  function get() {
    const token = Token(char, columnOffset, line);

    if (c1 === undefined) {
      token.type = ENDMARK;
      return next();
    }

    if (c1 === " ") {
      token.type = WHITESPACE;
      token.cargo = c1;
      getChar();
      return next();
    }

    if (c1 === "$") {
      token.type = FUNCTION;
      getChar();
      if (c1 === "(") {
        token.type = IDENTIFIER;
        getChar();
      }

      token.cargo = "";

      while (IDENTIFIER_CHARS.indexOf(c1) > -1) {
        token.cargo += c1;
        getChar();
      }

      if (token.type === IDENTIFIER && c1 === "{") {
        token.type = MEMBER;
      } else if (token.type === FUNCTION) {
        if (c1 !== "(") abort({column}, "Unexpected", c1 ? "char " + c1 : "end of line");
      } else if (token.type === IDENTIFIER) {
        if (c1 !== ")") abort({column}, "Unexpected", c1 ? "char " + c1 : "end of line");
      }

      getChar();

      return next();
    }

    if (c1 === "'") {
      let quoteChars = c1;
      token.cargo = "";
      token.type = LITERAL;

      if (c3 === "'''") {
        quoteChars = "'''";

        getChar();
        getChar();
        getChar();

        while (c3 !== "'''") {
          if (c3 === undefined) token.abort("Found end of file before end of string literal");
          token.cargo += c1;
          getChar();
        }

        getChar();
        getChar();
        getChar();
      } else {
        getChar();

        while (c1 !== quoteChars) {
          if (c1 === undefined) token.abort("Found end of file before end of string literal");
          else if (c1 === "\\") {
            getChar();
          }

          token.cargo += c1;
          getChar();
        }

        getChar();
      }

      return next(quoteChars, token.cargo, quoteChars);
    }

    if (NUMBER_STARTCHARS.indexOf(c1) > -1 && c2 !== "- ") {
      token.cargo = "";
      token.type = NUMBER;

      while (NUMBER_CHARS.indexOf(c1) > -1) {
        token.cargo += c1;
        getChar();
      }

      return next();
    }

    if (c1 === "[") {
      token.type = ARRAY;
      token.cargo = c1;
      getChar();
      return next();
    }

    if (c1 === "{") {
      token.type = OBJECT;
      token.cargo = c1;
      getChar();
      return next();
    }

    if (c1 === "(") {
      token.type = BLOCK;
      token.cargo = c1;
      getChar();
      return next();
    }

    if (twoCharacterSymbols.indexOf(c2) > -1) {
      token.cargo = c2;
      token.type = c2;

      if (c3 === undefined || column === 0) token.abort("Unexpected token", c2);

      getChar();
      getChar();
      return next();
    }

    if (c1 === "!") {
      token.cargo = c1;
      token.type = UNARY;

      getChar();
      if (c1 === "(" || c1 === "$") {
        return next();
      }

      return token.abort("Unexpected token", token.cargo);
    }

    if (oneCharacterSymbols.indexOf(c1) > -1) {
      token.cargo = c1;
      token.type = c1;

      if (c1 === "|" && (c2 === undefined || column === 0)) token.abort("Unexpected token |");

      getChar();
      return next();
    }

    if (IDENTIFIER_CHARS.indexOf(c1) > -1) {
      token.cargo = "";

      while (IDENTIFIER_CHARS.indexOf(c1) > -1) {
        token.cargo += c1;
        getChar();
      }

      if (token.cargo === "true") {
        token.type = BOOLEAN;
        return next();
      }

      if (token.cargo === "false") {
        token.type = BOOLEAN;
        return next();
      }

      if (keywords.indexOf(token.cargo) === -1) {
        token.abort("Unknown keyword", token.cargo);
      }

      token.type = token.cargo;
      return next();
    }

    return abort({column}, "Unexpected token", c1);

    function next() {
      while (c1 === " ") {
        getChar();
      }
      token.end(source, column);
      source = "";
      return token;
    }
  }

  function getChar() {
    if (c1) source += c1;

    char = scanner.get();
    column = char.column;
    c1 = char.c;
    c2 = char.c2;
    c3 = char.c3;
    return char;
  }
}

function Scanner(str) {
  const l = str.length;
  let column = -1;
  return {
    get,
  };

  function get() {
    const idx = ++column;
    const c = str[idx];
    const c2 = (idx + 1) < l ? c + str[idx + 1] : undefined;
    const c3 = (idx + 2) < l ? c2 + str[idx + 2] : undefined;
    return {column: idx, c, c2, c3};
  }
}

function Token(startChar, columnOffset = 0, line = 1) {
  const {column, c: cargo} = startChar;
  return {
    column,
    cargo,
    loc: {
      start: {
        line,
        column,
      }
    },
    end(source, endColumn) {
      this.loc.source = source;
      this.loc.start.column += columnOffset;
      this.loc.end = {
        line,
        column: endColumn + columnOffset,
      };
    },
    abort(...args) {
      abort(this, ...args);
    },
    get(opts) {
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
              name: this.cargo
            },
            loc: this.loc
          };
        }
        case FUNCTION: {
          return {
            type: this.type,
            callee: {
              type: "Identifier",
              name: this.cargo
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
            ...opts,
          };
        }
        default:
          return {
            type: this.type,
            cargo: this.cargo,
            loc: this.loc,
          };
      }
    },
  };
}

function abort({column}, ...args) {
  args.push(`at 0:${column}`);
  throw new SyntaxError(args.join(" "));
}
