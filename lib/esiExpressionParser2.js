/* eslint-disable prefer-template */
"use strict";

const {Lexer} = require("./expression/lexer");

const NUMBERS = "0123456789";
const IDENTIFIER_CHARS = `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ${NUMBERS}_`;

const ARRAY = "ArrayExpression";
const STRING = "Literal";
const IDENTIFIER = "Identifier";
const FUNCTION = "CallExpression";
const OBJECT = "MemberExpression";
const BINARY = "BinaryExpression";
const UNARY = "UnaryExpression";
const LOGICAL = "LogicalExpression";
const EXPRESSION = "Expression";
const WHITESPACE = "Space";
const ENDMARK = "EOL";

module.exports = function esiExpressionParser(input, extract) {
  if (!extract) return parse(input);
  return extractExpressions(input);
};

function extractExpressions(input) {
  if (!input) return;

  const hits = [];
  let str = input;

  let match;
  let offset = 0;
  while ((match = str.match(/\$(.*)$/m))) {
    if (("(" + IDENTIFIER_CHARS).indexOf(match[1][0]) === -1) {
      throw new SyntaxError("Unexpected $ at 0:" + match.index);
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

    offset = hit.index + 1;
    str = str.substring(offset);
  }

  return hits;
}

function parse(input, inExtraction) {
  if (!input) return;
  input = input.trim();

  const ast = AST();
  const parser = Parser(input, ast.push, ast.pop, inExtraction);
  while ((parser.consume())) {
    // No-op
  }

  return ast.tree;
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

    if (sourceMap) {
      switch (node.type) {
        case FUNCTION:
          node.source += ")";
          break;
      }
    }

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
        current.arguments.push(node);
        break;
      }
      case ARRAY: {
        current.elements.push(node);
        break;
      }
    }
  }

  function getLast() {
    return stack[stack.length - 1] || tree.body;
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
          if (arg.type === ",") {
            if (sourceMap) node.source += arg.source;
          }
          arg = consume();
        }
        onEnd(node);
        break;
      }
      case ARRAY: {
        onStart(node);
        let elm = consume();
        while (elm && elm.type !== "]") {
          if (elm.type === ",") {
            if (sourceMap) node.source += elm.source;
          }
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

        if (consume().type !== ")") token.abort("Unclosed" + OBJECT);
        onEnd(node);

        break;
      }
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
