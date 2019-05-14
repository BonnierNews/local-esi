"use strict";

module.exports = function esiExpressionParser(str) {
  str = str.trim();
  const nonsenseParentheseseMatch = str.match(/^\((.*)\)$/);
  if (nonsenseParentheseseMatch && wellFormedParentheses(nonsenseParentheseseMatch[1])) {
    str = nonsenseParentheseseMatch[1];
  }

  const binaryLogicalMatch = str.match(/(.+?(?:\d|\)|'))\s*(&{1,2}|\|{1,2})\s*((?:\(|\$|\d|').+)/);
  if (binaryLogicalMatch) {
    return {
      type: "LogicalExpression",
      operator: binaryLogicalMatch[2],
      left: esiExpressionParser(binaryLogicalMatch[1]),
      right: esiExpressionParser(binaryLogicalMatch[3])
    };
  }

  const binaryComparisonMatch = str.match(/(.+?)(==|>=|<=|<|>|has_i|has|matches_i|matches)(.+)/);
  if (binaryComparisonMatch) {
    return {
      type: "BinaryExpression",
      operator: binaryComparisonMatch[2],
      left: esiExpressionParser(binaryComparisonMatch[1]),
      right: esiExpressionParser(binaryComparisonMatch[3])
    };
  }

  const callExpressionMatch = str.match(/^\$(\w+?)\((.+?)\)$/);
  if (callExpressionMatch) {
    return {
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: callExpressionMatch[1]
      },
      arguments: callExpressionMatch[2].split(",").map(esiExpressionParser)
    };
  }

  const variableAccessMatch = str.match(/^\$\((.+?)\)/);
  if (variableAccessMatch) {
    const memberExpressionMatch = variableAccessMatch[1].match(/(.+?){'?(.+?)'?}/);

    if (memberExpressionMatch) {
      return {
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: memberExpressionMatch[1]
        },
        property: {
          type: "Identifier",
          name: memberExpressionMatch[2]
        }
      };
    }
    return {
      type: "Identifier",
      name: variableAccessMatch[1]
    };
  }

  const stringLiteralMatch = str.match(/^'([^']+?)'/);
  if (stringLiteralMatch) {
    return {
      type: "Literal",
      value: stringLiteralMatch[1]
    };
  }

  const numberLiteralMatch = str.match(/^(-?\d+)/);
  if (numberLiteralMatch) {
    return {
      type: "Literal",
      value: parseInt(numberLiteralMatch[1])
    };
  }

  const unaryPrefixMatch = str.match(/^(!)(.+)/);
  if (unaryPrefixMatch) {
    return {
      type: "UnaryExpression",
      prefix: true,
      operator: unaryPrefixMatch[1],
      argument: esiExpressionParser(unaryPrefixMatch[2])
    };
  }

  const escapedStringLiteralMatch = str.match(/^'''([^']+?)'''/);
  if (escapedStringLiteralMatch) {
    return {
      type: "Literal",
      value: escapedStringLiteralMatch[1]
    };
  }

  return {
    type: "Literal",
    value: str
  };
};

function wellFormedParentheses(str) {
  let open = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    if (char === "(") {
      open++;
    }

    if (char === ")") {
      open--;
      if (open < 0) {
        return false;
      }
    }
  }
  return open === 0;
}
