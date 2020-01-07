/* eslint-disable prefer-template */
"use strict";

const {Lexer} = require("./lexer");

const IDENTIFIER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

const {
  ARRAY,
  BINARY,
  ENDMARK,
  EXPRESSION,
  FUNCTION,
  IDENTIFIER,
  LITERAL,
  LOGICAL,
  MEMBER,
  OBJECT,
  UNARY,
  WHITESPACE,
} = require("./types");

module.exports = {
  parse,
  split,
};

function parse(input, sourceMap) {
  if (!input) return;
  input = input.trim();

  const ast = AST();
  const parser = Parser(input, ast.push, ast.pop, sourceMap);
  while ((parser.consume())) {
    // No-op
  }

  return ast.tree;
}

function split(input) {
  if (!input) return;

  const hits = [];
  let str = input;

  let match;
  let offset = 0;
  while ((match = str.match(/(?!\\)\$(.*)/))) {
    if (("(" + IDENTIFIER_CHARS).indexOf(match[1][0]) === -1) {
      throw new SyntaxError("Illegal character $ at 0:" + match.index);
    }

    if (match.index > 0) {
      hits.push({
        type: "TEXT",
        text: str.substring(0, match.index)
      });
    }

    const hit = {
      index: match.index + offset,
      source: "",
    };
    hits.push(hit);

    const ast = AST(true);
    const parser = Parser(match[0], ast.push, ast.pop, true);
    const expr = hit.expression = parser.consume(true);
    if (expr.source) hit.source += expr.source;

    offset = hit.index + hit.source.length;
    str = str.substring(offset);
  }

  if (str) {
    hits.push({type: "TEXT", text: str});
  }

  return hits;
}

function AST(sourceMap) {
  const tree = {
    type: EXPRESSION,
    body: {},
  };
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
        if (node.type === BINARY) break;
        if (sourceMap) current.source += node.source;
        addToCommaSeparatedList(node, current.arguments);
        break;
      }
      case ARRAY: {
        if (sourceMap) current.source += node.source;
        addToCommaSeparatedList(node, current.elements);
        break;
      }
      case OBJECT: {
        let prop = current.properties[current.properties.length - 1];
        if (!prop || popped.type === ",") {
          prop = {
            type: "Property"
          };
          current.properties.push(prop);
        }

        if (popped.type === ",") {
          break;
        } else if (!prop.key) {
          prop.key = {
            type: IDENTIFIER,
            name: popped.value
          };
        } else if (!prop.value) {
          prop.value = popped;
        }

        break;
      }
    }
  }

  function getLast() {
    return stack[stack.length - 1] || tree.body;
  }

  function addToCommaSeparatedList(node, list) {
    const lastIdx = list.length - 1;
    if (lastIdx > -1) {
      if (node.type === ",") {
        if (list[lastIdx].type === ",") throw new SyntaxError("Unexpected comma");
        list.push(node);
      } else {
        if (list[lastIdx].type !== ",") throw new SyntaxError(`Unexpected ${node.type}`);
        list[lastIdx] = node;
      }
    } else {
      list.push(node);
    }
  }
}

function Parser(sourceText, onStart, onEnd, sourceMap) {
  const lexer = Lexer(sourceText, sourceMap);
  return {
    consume,
  };

  function consume() {
    const token = lexer.get();
    if (token.type === ENDMARK) return;

    const node = Node(token.get());
    if (sourceMap) {
      node.source = token.source;
    }

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
        if (sourceMap) node.source += arg.source;

        onEnd(node);
        break;
      }
      case ARRAY: {
        onStart(node);
        let elm = consume();
        while (elm && elm.type !== "]") {
          elm = consume();
        }
        onEnd(node);
        break;
      }
      case IDENTIFIER: {
        onStart(node);
        onEnd(node);
        break;
      }
      case LITERAL: {
        onStart(node);
        onEnd(node);
        break;
      }
      case MEMBER: {
        let prop;
        onStart(node);
        do {
          node.property = prop;
          prop = consume();
          if (sourceMap) node.source += prop.source;
        } while (prop && prop.type !== "}");

        if (consume().type !== ")") token.abort("Unclosed" + MEMBER);

        if (sourceMap) node.source += ")";
        onEnd(node);

        break;
      }
      case OBJECT: {
        onStart(node);
        let arg = consume();
        while (arg && arg.type !== "}") {
          arg = consume();
        }
        if (sourceMap) node.source += arg.source;

        onEnd(node);
        break;
      }
      case ",":
        onStart(node);
        onEnd(node);
        break;
    }

    return node;

    function Node(t) {
      const {type, ...rest} = t;
      return {
        type,
        ...rest,
      };
    }
  }
}
