/* eslint-disable prefer-template */
"use strict";

const oneCharacterSymbols = "=()<>|*+-!&{}/%,";
const twoCharacterSymbols = `
==
<=
>=
<>
!=
++
**
--
+=
-=
||
&&
  `.split("\n").filter(Boolean);


const keywords = ["matches", "matches_i", "has", "has_i", "true", "false"];

const trippleQuote = "'''";

const WHITESPACE_CHAR = " ";
const IDENTIFIER_STARTCHARS = "$";
const STRING_STARTCHARS = "'";
const NUMBERS = "0123456789";
const NUMBER_STARTCHARS = `-${NUMBERS}`;
const NUMBER_CHARS = NUMBER_STARTCHARS + ".";
const IDENTIFIER_CHARS = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ${NUMBERS}_`;
const MEMBER_STARTCHARS = "{";
const STRING = "Literal";
const NUMBER = "Number";
const IDENTIFIER = "Identifier";
const FUNCTION = "CallExpression";
const OBJECT = "MemberExpression";
const BINARY = "BinaryExpression";
const UNARY = "UnaryExpression";
const LOGICAL = "LogicalExpression";
const EXPRESSION = "Expression";
const WHITESPACE = "Space";
const ENDMARK = "EOL";

module.exports = function esiExpressionParser(input) {
  let ast;
  try {
    ast = AST();
    const consumer = Consumer(input, ast.push, ast.pop);
    while ((consumer.consume())) {
      // No-op
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw err;
    }
    return {
      type: STRING,
      value: input,
    };
  }

  return ast.tree;
};

function AST() {
  const tree = Node({
    type: EXPRESSION,
    body: {},
  });
  const stack = [tree];
  return {
    push,
    pop,
    get tree() {
      return tree.body;
    }
  };

  function push(node) {
    const current = getLast();
    stack.push(node);

    switch (node.type) {
      case LOGICAL:
        if (current.type === EXPRESSION) {
          node.left = current.body;
          current.body = node;
        } else if (current.type === LOGICAL) {
          node.left = current.right;
          current.right = node;
        }
        break;
      case BINARY: {
        if (current.type === EXPRESSION) {
          node.left = current.body;
          current.body = node;
        } else if (current.type === LOGICAL) {
          node.left = current.right;
        } else if (current.type === FUNCTION) {
          const arg = current.arguments.pop();
          node.left = arg;
          current.arguments.push(node);
        }
        break;
      }
      case UNARY:
        if (current.type === EXPRESSION) current.body = node;
        break;
    }
  }

  function pop(node) {
    const popped = stack.pop();
    const current = getLast();
    if (current === popped) return current;

    switch (current && current.type) {
      case EXPRESSION: {
        current.body = node;
        break;
      }
      case LOGICAL: {
        current.right = node;
        break;
      }
      case BINARY: {
        current.right = node;
        pop(current);
        break;
      }
      case UNARY: {
        current.argument = node;
        pop(current);
        break;
      }
      case FUNCTION: {
        if (node.type !== BINARY) {
          current.arguments.push(node);
        }
        break;
      }
    }
  }

  function getLast() {
    return stack[stack.length - 1] || tree.body;
  }
}

function Node(token) {
  const {type, ...rest} = token;
  return {
    type,
    ...rest,
  };
}

function Consumer(sourceText, onStart, onEnd) {
  const lexer = Lexer(sourceText);

  return {
    consume,
  };

  function consume() {
    const token = lexer.get();
    if (token.type === ENDMARK) return;

    const node = Node(token.get());

    switch (node.type) {
      case BINARY: {
        onStart(node);
        break;
      }
      case LOGICAL: {
        onStart(node);
        break;
      }
      case UNARY: {
        onStart(node);
        break;
      }
      case WHITESPACE: {
        return consume();
      }
      case FUNCTION: {
        onStart(node);
        let arg = consume();
        while (arg && arg.type !== ")") {
          arg = consume();
        }
        onEnd(node);
        break;
      }
      case IDENTIFIER: {
        onStart(node);
        if (consume().type !== ")") token.abort("unclosed", IDENTIFIER);
        onEnd(node);
        break;
      }
      case STRING: {
        onStart(node);
        onEnd(node);
        break;
      }
      case OBJECT: {
        let prop;
        onStart(node);
        do {
          node.property = prop;
          prop = consume();
        } while (prop && prop.type !== "}");

        if (consume().type !== ")") token.abort("unclosed" + OBJECT);
        onEnd(node);

        break;
      }
    }

    return node;
  }
}


function Token(startChar) {
  const {colIndex, c: cargo} = startChar;
  return {
    abort(...args) {
      args.push(`at 0:${colIndex}`);
      throw new SyntaxError(args.join(" "));
    },
    colIndex,
    cargo,
    get(opts) {
      switch (this.type) {
        case IDENTIFIER: {
          return {
            type: this.type,
            name: this.cargo,
          };
        }
        case STRING: {
          return {
            type: this.type,
            value: this.cargo,
          };
        }
        case NUMBER: {
          return {
            type: STRING,
            value: Number(this.cargo),
          };
        }
        case OBJECT: {
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
        case "false":
        case "true": {
          return {
            type: STRING,
            value: this.cargo === "true",
          };
        }
        case "!": {
          return {
            type: UNARY,
            operator: this.type,
            prefix: true,
          };
        }
        case "&":
        case "&&":
        case "|": {
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
        case WHITESPACE:
        case "{":
        case "}":
        case "(":
        case ")":
        case ",":
          return {
            type: this.type
          };
        default:
          this.abort("unknown character", this.type);
      }
    },
  };
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
    const c2 = idx < l ? c + str[idx + 1] : undefined;
    const c3 = (idx + 2) < l ? c2 + str[idx + 2] : undefined;
    return {colIndex: idx, c, c2, c3};
  }
}

function Lexer(str) {
  const scanner = Scanner(str);

  let char, c1, c2, c3;
  getChar();

  return {
    get,
  };

  function get() {
    const token = Token(char);

    if (c1 === WHITESPACE_CHAR) {
      token.type = WHITESPACE;
      token.cargo = c1;
      getChar();
      return token;
    }

    if (IDENTIFIER_STARTCHARS.indexOf(c1) > -1) {
      if (c2 === IDENTIFIER_STARTCHARS + "(") {
        token.type = IDENTIFIER;
        getChar();
        getChar();
      } else {
        token.type = FUNCTION;
        getChar();
      }
      token.cargo = "";

      while (IDENTIFIER_CHARS.indexOf(c1) > -1) {
        token.cargo += c1;
        getChar();
      }

      if (token.type === IDENTIFIER) {
        if (MEMBER_STARTCHARS.indexOf(c1) > -1) {
          token.type = OBJECT;
        }
      }

      return token;
    }

    if (STRING_STARTCHARS.indexOf(c1) > -1) {
      const quoteChar = c1;
      token.cargo = "";

      if (c3 === trippleQuote) {
        getChar();
        getChar();
        getChar();

        while (c3 !== trippleQuote) {
          if (c3 === undefined) token.abort("Found end of file before end of string literal");
          token.cargo += c1;
          getChar();
        }

        getChar();
        getChar();
        getChar();

      } else {
        getChar();

        while (c1 !== quoteChar) {
          if (c1 === undefined) token.abort("Found end of file before end of string literal");
          token.cargo += c1;
          getChar();
        }

        getChar();
      }

      token.type = STRING;
      return token;
    }

    if (NUMBER_STARTCHARS.indexOf(c1) > -1) {
      if (c2 !== "- ") {
        token.cargo = "";
        while (NUMBER_CHARS.indexOf(c1) > -1) {
          token.cargo += c1;
          getChar();
        }
        token.type = NUMBER;
        return token;
      }
    }

    if (twoCharacterSymbols.indexOf(c2) > -1) {
      token.cargo = c2;
      token.type = c2;
      getChar();
      getChar();
      return token;
    }

    if (oneCharacterSymbols.indexOf(c1) > -1) {
      token.cargo = c1;
      token.type = c1;
      getChar();
      return token;
    }

    if (IDENTIFIER_CHARS.indexOf(c1) > -1) {
      token.cargo = "";

      while (IDENTIFIER_CHARS.indexOf(c1) > -1) {
        token.cargo += c1;
        getChar();
      }

      if (keywords.indexOf(token.cargo) === -1) {
        token.abort("unknown keyword", token.cargo);
      }

      token.type = token.cargo;
    }

    if (c1 === undefined) {
      token.type = ENDMARK;
      return token;
    }

    return token;
  }

  function getChar() {
    char = scanner.get();
    c1 = char.c;
    c2 = char.c2;
    c3 = char.c3;
    return char;
  }
}
