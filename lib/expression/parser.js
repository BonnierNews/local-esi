/* eslint-disable prefer-template */

import { Lexer } from "./lexer.js";
import {
  ARRAY,
  BINARY,
  BLOCK,
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
} from "./types.js";

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

export function parse(input, columnOffset) {
  if (!input) return;
  input = input.trim();

  const ast = new AST(columnOffset);
  const parser = new Parser(input, ast, columnOffset);
  while ((parser.consume())) {
    // No-op
  }

  return ast.tree;
}

export function split(input) {
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
