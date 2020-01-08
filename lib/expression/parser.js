/* eslint-disable prefer-template */
"use strict";

const {Lexer} = require("./lexer");

const {
  ARRAY,
  BINARY,
  BLOCK,
  ENDMARK,
  EXPRESSION,
  FUNCTION,
  IDENTIFIER,
  IDENTIFIER_CHARS,
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

  const ast = AST(sourceMap);
  const parser = Parser(input, ast.openNode, ast.closeNode, sourceMap);
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
      raw: "",
    };
    hits.push(hit);

    const ast = AST(true);
    const parser = Parser(match[0], ast.openNode, ast.closeNode, true);
    const expr = hit.expression = parser.consume(true);
    if (expr.raw) hit.raw += expr.raw;

    offset = hit.index + hit.raw.length;
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
    openNode,
    closeNode,
    get tree() {
      return tree.body;
    }
  };

  function openNode(node) {
    const current = getLast();
    stack.push(node);

    switch (node.type) {
      case BINARY:
      case LOGICAL:
        switchLeft();
        break;
      case UNARY:
        if (current.type === EXPRESSION) current.body = node;
        break;
    }

    function switchLeft() {
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
  }

  function closeNode(node) {
    const popped = stack.pop();
    const current = getLast();
    if (current === popped) return current;

    switch (current && current.type) {
      case BINARY: {
        current.right = node;
        closeNode(current);
        break;
      }
      case BLOCK: {
        current.body = node;
        if (sourceMap) current.raw += node.raw;
        // pop(current);
        break;
      }
      case EXPRESSION: {
        current.body = node;
        break;
      }
      case LOGICAL: {
        current.right = node;
        break;
      }
      case UNARY: {
        current.argument = node;
        if (sourceMap) current.raw += node.raw;
        closeNode(current);
        break;
      }
      case FUNCTION: {
        if (node.type === BINARY) break;
        if (sourceMap) current.raw += node.raw;
        addToCommaSeparatedList(node, current.arguments);
        break;
      }
      case ARRAY: {
        if (sourceMap) current.raw += node.raw;
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
      node.raw = token.raw;
    }

    switch (node.type) {
      case BINARY:
      case LOGICAL:
      case UNARY: {
        onStart(node);
        break;
      }
      case ARRAY: {
        onStart(node);
        let elm = consume();
        while (elm && elm.type !== "]") {
          elm = consume();
        }
        if (sourceMap) node.raw += elm.raw;

        onEnd(node);
        break;
      }
      case BLOCK: {
        onStart(node);
        let arg = consume();
        while (arg && arg.type !== ")") {
          arg = consume();
        }

        if (!arg || arg.type !== ")") return token.abort("Unclosed", BLOCK);

        if (sourceMap) node.raw += arg.raw;
        onEnd(node);
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
        if (sourceMap) node.raw += arg.raw;
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
          if (sourceMap) node.raw += prop.raw;
        } while (prop && prop.type !== "}");

        const end = consume();
        if (end.type !== ")") token.abort("Unclosed", MEMBER);

        if (sourceMap) node.raw += end.raw;
        onEnd(node);

        break;
      }
      case OBJECT: {
        onStart(node);
        let arg = consume();
        while (arg && arg.type !== "}") {
          arg = consume();
        }
        if (sourceMap) node.raw += arg.raw;

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
