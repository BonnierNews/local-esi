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
    };
    hits.push(hit);

    const ast = AST(true);
    const parser = Parser(match[0], ast.openNode, ast.closeNode, true);
    hit.expression = parser.consume();
    offset = hit.index + hit.expression.loc.source.trim().length;
    str = str.substring(offset);
  }

  if (str) {
    hits.push({type: "TEXT", text: str});
  }

  return hits;
}

function AST() {
  const tree = {
    type: EXPRESSION,
    body: {},
  };
  const stack = [tree];

  return {
    openNode,
    closeNode,
    get tree() {
      while (stack.length > 1) {
        doClose(stack.pop(), getLast());
      }
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

  function doClose(node, current) {
    current = current || getLast();

    switch (node.type) {
      case LOGICAL:
      case BINARY: {
        node.loc.source = node.left.loc.source + node.loc.source + node.right.loc.source;
        node.loc.start = {...node.left.loc.start};
        node.loc.end = {...node.right.loc.end};
        break;
      }
      case UNARY: {
        node.loc.source = node.loc.source + node.argument.loc.source;
        node.loc.end = {...node.argument.loc.end};
        break;
      }
    }

    if (current === node) return;

    switch (current && current.type) {
      case BINARY: {
        current.right = node;
        closeNode(current);
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
        closeNode(current);
        break;
      }
      case ARRAY: {
        addArrayElement(current, node);
        break;
      }
      case FUNCTION: {
        if (node.type === BINARY) break;
        addFunctionArgument(current, node);
        break;
      }
    }
  }

  function closeNode(node) {
    stack.pop();
    const current = getLast();

    doClose(node, current);
  }

  function getLast() {
    return stack[stack.length - 1] || tree.body;
  }

  function addArrayElement(current, node) {
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
        node.loc.start = {...lastElm.loc.start};
      }
    } else {
      current.elements.push(node);
    }
  }

  function addFunctionArgument(current, node) {
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
        node.loc.start = {...lastArg.loc.start};
      }
    } else {
      current.arguments.push(node);
    }
  }
}

function Parser(sourceText, onStart, onEnd, sourceMap) {
  const lexer = Lexer(sourceText, sourceMap);
  let token;
  return {
    consume,
  };

  function consume() {
    token = lexer.get();
    if (token.type === ENDMARK) return;

    const node = Node(token.get());

    switch (node.type) {
      case BINARY:
      case LOGICAL:
      case UNARY: {
        onStart(node);
        break;
      }
      case ARRAY: {
        onStart(node);
        node.elements = [];

        let elm;
        elm = consume();

        while (elm && elm.type !== "]") {
          if (elm.type === ",") return token.abort("Unexpected", elm.type, "in", node.type);

          elm = consume();
          if (!elm) break;

          if (elm.type === ",") {
            elm = consume();
          } else if (elm.type !== "]") return token.abort("Unexpected", elm.type, "in", node.type);
        }

        if (!elm || elm.type !== "]") return token.abort("Unclosed", node.type);

        node.elements.forEach((a) => {
          node.loc.source += a.loc.source;
        });

        node.loc.source += elm.loc.source;
        node.loc.end = {...elm.loc.end};

        onEnd(node);
        break;
      }
      case BLOCK: {
        onStart(node);
        const source = node.loc.source;

        let arg = consume();
        while (arg && arg.type !== ")") {
          arg = consume();
        }

        if (!arg || arg.type !== ")") return token.abort("Unclosed", node.type);

        node.loc.source = source + node.body.loc.source + arg.loc.source;
        node.loc.end = arg.loc.end;

        onEnd(node);
        break;
      }
      case WHITESPACE: {
        return consume();
      }
      case FUNCTION: {
        onStart(node);

        let arg = consume();
        if (arg && arg.type === ",") return token.abort("Unexpected", arg.type, "in", node.type);

        while (arg && arg.type !== ")") {
          arg = consume();
        }
        if (!arg || arg.type !== ")") return token.abort("Unclosed", node.type);

        node.arguments.forEach((a) => {
          node.loc.source += a.loc.source;
        });

        node.loc.source += arg.loc.source;
        node.loc.end = {...arg.loc.end};

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
          if (!prop) continue;
          node.loc.source += prop.loc.source;
        } while (prop && prop.type !== "}");

        const end = consume();
        if (!end || end.type !== ")") return token.abort("Unclosed", node.type);


        node.loc.source += end.loc.source;
        node.loc.end = end.loc.end;
        onEnd(node);

        break;
      }
      case OBJECT: {
        onStart(node);
        node.properties = [];

        let prop = consume();
        addObjectProperty(node, null, prop);

        while (prop && prop.type !== "}") {
          prop = consume();
          if (prop && prop.type === ",") {
            addObjectProperty(node, prop, consume());
          }
        }
        if (!prop || prop.type !== "}") return token.abort("Unclosed", node.type);

        node.properties.forEach((a) => {
          node.loc.source += a.loc.source;
        });

        node.loc.source += prop.loc.source;
        node.loc.end = prop.loc.end;

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

    function addObjectProperty(objectNode, commaNode, keyNode) {
      if (keyNode && keyNode.type === "}") return;
      if (!keyNode) return token.abort("Unclosed", OBJECT);
      if (keyNode.type !== LITERAL) return token.abort("Unexpected key", keyNode.type);

      const colon = consume();
      if (!colon) return token.abort("Missing key value separator");
      if (colon.type !== ":") return token.abort("Unexpected", colon.type, "in object");

      const value = consume();
      const property = {
        type: "Property",
        key: {
          type: IDENTIFIER,
          name: keyNode.value,
        },
        value,
        loc: {
          source: [commaNode, keyNode, colon, value]
            .filter(Boolean)
            .map((n) => n.loc.source)
            .join(""),
          start: {...((commaNode || keyNode).loc.start)},
          end: {...value.loc.end},
        }
      };

      objectNode.properties.push(property);
    }
  }
}
