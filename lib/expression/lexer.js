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

function Lexer(str, sourceMap) {
  const scanner = Scanner(str);

  let colIndex, char, c1, c2, c3;
  let collectedWs = "";
  getChar();

  return {
    get,
  };

  function get() {
    const token = Token(char);

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
        if (c1 !== "(") abort({colIndex}, "Unexpected", c1 ? "char " + c1 : "end of line");
      } else if (token.type === IDENTIFIER) {
        if (c1 !== ")") abort({colIndex}, "Unexpected", c1 ? "char " + c1 : "end of line");
      }

      getChar();

      if (sourceMap) {
        switch (token.type) {
          case IDENTIFIER:
            return next("$(", token.cargo, ")");
          case MEMBER:
            return next("$(", token.cargo, "{");
          case FUNCTION:
            return next("$", token.cargo, "(");
        }
      }

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

      if (c3 === undefined || colIndex === 0) token.abort("Unexpected token", c2);

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

      if (c1 === "|" && (c2 === undefined || colIndex === 0)) token.abort("Unexpected token |");

      getChar();
      return next();
    }

    if (IDENTIFIER_CHARS.indexOf(c1) > -1) {
      token.cargo = "";

      while (IDENTIFIER_CHARS.indexOf(c1) > -1) {
        token.cargo += c1;
        getChar();
      }

      if (keywords.indexOf(token.cargo) === -1) {
        token.abort("Unknown keyword", token.cargo);
      }

      token.type = token.cargo;
      return next();
    }

    return abort({colIndex}, "Unexpected token", c1);

    function next(...sourceArgs) {
      if (sourceMap) {
        token.raw = collectedWs + (sourceArgs.length ? sourceArgs.join("") : token.cargo);
        collectedWs = "";

        while (c1 === " ") {
          collectedWs += c1;
          getChar();
        }
      }

      return token;
    }
  }

  function getChar() {
    char = scanner.get();
    colIndex = char.colIndex;
    c1 = char.c;
    c2 = char.c2;
    c3 = char.c3;
    return char;
  }
}

function Scanner(str) {
  const l = str.length;
  let colIndex = -1;
  return {
    get,
  };

  function get() {
    const idx = ++colIndex;
    const c = str[idx];
    const c2 = (idx + 1) < l ? c + str[idx + 1] : undefined;
    const c3 = (idx + 2) < l ? c2 + str[idx + 2] : undefined;
    return {colIndex: idx, c, c2, c3};
  }
}

function Token(startChar) {
  const {colIndex, c: cargo} = startChar;
  return {
    abort(...args) {
      abort(this, ...args);
    },
    colIndex,
    cargo,
    get(opts) {
      switch (this.type) {
        case BLOCK: {
          return {
            type: this.type,
          };
        }
        case IDENTIFIER: {
          return {
            type: this.type,
            name: this.cargo,
          };
        }
        case LITERAL: {
          return {
            type: this.type,
            value: this.cargo,
          };
        }
        case NUMBER: {
          return {
            type: LITERAL,
            value: Number(this.cargo),
          };
        }
        case MEMBER: {
          return {
            type: this.type,
            object: {
              type: "Identifier",
              name: this.cargo
            },
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
          };
        }
        case ARRAY: {
          return {
            type: this.type,
            elements: [],
          };
        }
        case OBJECT: {
          return {
            type: this.type,
            properties: [],
          };
        }
        case UNARY: {
          return {
            type: this.type,
            operator: this.cargo,
            prefix: true,
          };
        }
        case "&":
        case "&&":
        case "|":
        case "||": {
          return {
            type: LOGICAL,
            operator: this.cargo,
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
            ...opts,
          };
        }
        default:
          return {
            type: this.type,
            cargo: this.cargo,
          };
      }
    },
  };
}

function abort({colIndex}, ...args) {
  args.push(`at 0:${colIndex}`);
  throw new SyntaxError(args.join(" "));
}
