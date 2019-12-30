"use strict";

const esiExpressionParser = require("../lib/esiExpressionParser2");

describe("esiExpressionParser", () => {
  it("handle binary expression with identifier on left side and literal on right", () => {
    const input = "$(access_granted)=='true'";
    const result = esiExpressionParser(input);
    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator", "==");
    expect(result).to.have.property("left");
    expect(result.left).to.have.property("type", "Identifier");
    expect(result.left).to.have.property("name", "access_granted");
    expect(result).to.have.property("right");
    expect(result.right).to.have.property("type", "Literal");
    expect(result.right).to.have.property("value", "true");
  });

  it("handle binary negative expression with identifier on left side and literal on right", () => {
    const input = "$(access_granted)!='true'";
    const result = esiExpressionParser(input);
    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator", "!=");
    expect(result).to.have.property("left");
    expect(result.left).to.have.property("type", "Identifier");
    expect(result.left).to.have.property("name", "access_granted");
    expect(result).to.have.property("right");
    expect(result.right).to.have.property("type", "Literal");
    expect(result.right).to.have.property("value", "true");
  });

  it("handles call expression with argument", () => {
    const input = "$exists($(user_email))";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.have.property("callee").that.eql({
      type: "Identifier",
      name: "exists"
    });
    expect(result).to.have.property("arguments").to.eql([{
      type: "Identifier",
      name: "user_email"
    }]);
  });

  it("handles call expression without argument", () => {
    const input = "$time()";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.have.property("callee").that.eql({
      type: "Identifier",
      name: "time"
    });
    expect(result).to.have.property("arguments").to.eql([]);
  });

  it("should handle unary expression with ! operator", () => {
    const input = "!$exists($(HTTP_COOKIE{'remember_me'}))";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "UnaryExpression");
    expect(result).to.have.property("operator", "!");
    expect(result).to.have.property("prefix", true);
    expect(result).to.have.property("argument").to.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "exists"
      },
      arguments: [{
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_COOKIE"
        },
        property: {
          type: "Literal",
          value: "remember_me"
        }
      }]
    });
  });

  it("should handle member expression", () => {
    const input = "$(HTTP_COOKIE{'remember_me'})";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "MemberExpression");
    expect(result).to.have.property("object").that.eql({
      type: "Identifier",
      name: "HTTP_COOKIE"
    });

    expect(result).to.have.property("property").that.eql({
      type: "Literal",
      value: "remember_me"
    });
  });

  it("should handle member expression with array access", () => {
    const input = "$(someVar{1})";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "MemberExpression");
    expect(result).to.have.property("object").that.eql({
      type: "Identifier",
      name: "someVar"
    });

    expect(result).to.have.property("property").that.eql({
      type: "Literal",
      value: 1
    });
  });

  it("handle logical expression with & operator ", () => {
    const input = "$(HTTP_USER_AGENT{'os'})=='WIN' & $(HTTP_USER_AGENT{'browser'})=='MSIE'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("operator", "&");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      operator: "==",
      left: {
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_USER_AGENT"
        },
        property: {
          type: "Literal",
          value: "os"
        }
      },
      right: {
        type: "Literal",
        value: "WIN"
      }
    });
    expect(result).to.have.property("right").that.eql({
      type: "BinaryExpression",
      operator: "==",
      left: {
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_USER_AGENT"
        },
        property: {
          type: "Literal",
          value: "browser"
        }
      },
      right: {
        type: "Literal",
        value: "MSIE"
      }
    });
  });

  it("should logical binary expression with call expressions", () => {
    const input = "$exists($(HTTP_COOKIE{'remember_me'})) | $exists($(HTTP_COOKIE{'accessToken'}))";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("operator", "|");
    expect(result).to.have.property("left").that.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "exists"
      },
      arguments: [{
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_COOKIE"
        },
        property: {
          type: "Literal",
          value: "remember_me"
        }
      }]
    });
    expect(result).to.have.property("right").that.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "exists"
      },
      arguments: [{
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_COOKIE"
        },
        property: {
          type: "Literal",
          value: "accessToken"
        }
      }]
    });
  });

  it("handle logical expression where left is a unary expression", () => {
    const input = "!$exists($(HTTP_COOKIE{'remember_me'})) | $exists($(HTTP_COOKIE{'accessToken'}))";
    const result = esiExpressionParser(input);
    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("operator", "|");
    expect(result).to.have.property("left").that.eql({
      type: "UnaryExpression",
      operator: "!",
      prefix: true,
      argument: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "exists"
        },
        arguments: [{
          type: "MemberExpression",
          object: {
            type: "Identifier",
            name: "HTTP_COOKIE"
          },
          property: {
            type: "Literal",
            value: "remember_me"
          }
        }]
      }
    });
    expect(result).to.have.property("right").that.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "exists"
      },
      arguments: [{
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_COOKIE"
        },
        property: {
          type: "Literal",
          value: "accessToken"
        }
      }]
    });
  });

  it("handle multiple ors", () => {
    const input = "$exists($(HTTP_COOKIE{'remember_me'})) | $exists($(HTTP_COOKIE{'accessToken'})) | $exists($(HTTP_COOKIE{'sessionKey'}))";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("operator", "|");
    expect(result).to.have.property("left").that.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "exists"
      },
      arguments: [{
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "HTTP_COOKIE"
        },
        property: {
          type: "Literal",
          value: "remember_me"
        }
      }]
    });
    expect(result).to.have.property("right").that.eql({
      type: "LogicalExpression",
      operator: "|",
      left: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "exists"
        },
        arguments: [{
          type: "MemberExpression",
          object: {
            type: "Identifier",
            name: "HTTP_COOKIE"
          },
          property: {
            type: "Literal",
            value: "accessToken"
          }
        }]
      },
      right: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "exists"
        },
        arguments: [{
          type: "MemberExpression",
          object: {
            type: "Identifier",
            name: "HTTP_COOKIE"
          },
          property: {
            type: "Literal",
            value: "sessionKey"
          }
        }]
      }
    });
  });

  it("handles logical expression with && operator", () => {
    const input = "$(someVar) == 'a' && $(someVar2) == 'b'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Identifier",
        name: "someVar"
      },
      operator: "==",
      right: {
        type: "Literal",
        value: "a"
      }
    });
    expect(result).to.have.property("operator").that.eql("&&");
    expect(result).to.have.property("right").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Identifier",
        name: "someVar2"
      },
      operator: "==",
      right: {
        type: "Literal",
        value: "b"
      }
    });
  });

  it("handles binary expression with number literal", () => {
    const input = "$(someVar) == 59";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 59
    });
  });

  it("handles binary expression with negative number literal", () => {
    const input = "$(someVar) == -1";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: -1
    });
  });

  it("handles binary expression with >= operator", () => {
    const input = "$(someVar) >= 59";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql(">=");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 59
    });
  });

  it("handles binary expression with <= operator", () => {
    const input = "$(someVar) <= 590";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql("<=");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 590
    });
  });

  it("handles binary expression with < operator", () => {
    const input = "$(someVar) < 590";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql("<");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 590
    });
  });

  it("handles binary expression with > operator", () => {
    const input = "$(someVar) > 590";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql(">");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 590
    });
  });

  it("handles binary expression enclosed in unnecessary parentheses", () => {
    const input = "($(someVar) <= 590)";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql("<=");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 590
    });
  });

  it("handles binary expression where each expression is enclosed in unnecessary parentheses", () => {
    const input = "($(someVar)) <= (590)";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("operator").that.eql("<=");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 590
    });
  });

  it("handles binary expression where each expression is enclosed in unnecessary parentheses", () => {
    const input = "($(someVar) == 1) && (2 == $(someVar))";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Identifier",
        name: "someVar"
      },
      operator: "==",
      right: {
        type: "Literal",
        value: 1
      }
    });
    expect(result).to.have.property("operator").that.eql("&&");
    expect(result).to.have.property("right").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: 2
      },
      operator: "==",
      right: {
        type: "Identifier",
        name: "someVar"
      }
    });
  });

  it("handles triple quoute enclosed string", () => {
    const input = "$(someVar) == '''my\\value'''";
    const result = esiExpressionParser(input);
    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "someVar"
    });
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: "my\\value"
    });
  });

  it("handles number literal expression", () => {
    const input = "59";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "Literal");
    expect(result).to.have.property("value").that.eql(59);
  });

  it("handles string literal expression2", () => {
    const input = "'jan.bananberg@test.com'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "Literal");
    expect(result).to.have.property("value").that.eql("jan.bananberg@test.com");
  });

  it("handles binary expression where one expression is a regular expression", () => {
    const input = "$(HTTP_REFERER) matches '''(google|yahoo|bing|yandex)\\.\\d+$'''";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "HTTP_REFERER"
    });
    expect(result).to.have.property("operator").that.eql("matches");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: "(google|yahoo|bing|yandex)\\.\\d+$"
    });
  });

  it("handles multiple evaluations with two regular expressions", () => {
    const input = "$(HTTP_REFERER) matches '''(google|yahoo|bing|yandex)\\.\\d+$''' && 'newyork' matches 'newyorknewyork'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "LogicalExpression");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Identifier",
        name: "HTTP_REFERER"
      },
      operator: "matches",
      right: {
        type: "Literal",
        value: "(google|yahoo|bing|yandex)\\.\\d+$"
      }
    });
    expect(result).to.have.property("operator").that.eql("&&");
    expect(result).to.have.property("right").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: "newyork"
      },
      operator: "matches",
      right: {
        type: "Literal",
        value: "newyorknewyork"
      }
    });
  });

  it("handles variables named 'has' (although it's used in binary expressions)", () => {
    const input = "$(has) == 'true'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "has"
    });
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: "true"
    });
  });

  it("handles variables named 'has' and 'has_i' (although they are used in binary expressions)", () => {
    const input = "$(has_i) == $(has)";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Identifier",
      name: "has_i"
    });
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("right").that.eql({
      type: "Identifier",
      name: "has"
    });
  });

  it("handles string binary expression with +", () => {
    const input = "'1' + '2'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Literal",
      value: "1"
    });
    expect(result).to.have.property("operator").that.eql("+");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: "2"
    });
  });

  it("handles arithmetic binary expression with +", () => {
    const input = "1 + 2";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Literal",
      value: 1
    });
    expect(result).to.have.property("operator").that.eql("+");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 2
    });
  });

  it("handles arithmetic binary expression with -", () => {
    const input = "1 - 2";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Literal",
      value: 1
    });
    expect(result).to.have.property("operator").that.eql("-");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 2
    });
  });

  it("handles arithmetic binary expression with *", () => {
    const input = "1 * 2";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Literal",
      value: 1
    });
    expect(result).to.have.property("operator").that.eql("*");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 2
    });
  });

  it("handles arithmetic binary expression with /", () => {
    const input = "1 / 2";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Literal",
      value: 1
    });
    expect(result).to.have.property("operator").that.eql("/");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 2
    });
  });

  it("handles arithmetic binary expression with %", () => {
    const input = "1 % 2";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("left").that.eql({
      type: "Literal",
      value: 1
    });
    expect(result).to.have.property("operator").that.eql("%");
    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 2
    });
  });

  it("gives higher precedence to + expressions than ==", () => {
    const input = "1 + 2 == 3";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: 1
      },
      operator: "+",
      right: {
        type: "Literal",
        value: 2
      }
    });

    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 3
    });
  });

  it("gives higher precedence to - expressions than ==", () => {
    const input = "1 - 2 == 3";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: 1
      },
      operator: "-",
      right: {
        type: "Literal",
        value: 2
      }
    });

    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 3
    });
  });

  it("gives higher precedence to * expressions than ==", () => {
    const input = "1 * 2 == 3";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: 1
      },
      operator: "*",
      right: {
        type: "Literal",
        value: 2
      }
    });

    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 3
    });
  });

  it("gives higher precedence to / expressions than ==", () => {
    const input = "1 / 2 == 3";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: 1
      },
      operator: "/",
      right: {
        type: "Literal",
        value: 2
      }
    });

    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 3
    });
  });

  it("gives higher precedence to % expressions than ==", () => {
    const input = "1 % 2 == 3";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "BinaryExpression");
    expect(result).to.have.property("operator").that.eql("==");
    expect(result).to.have.property("left").that.eql({
      type: "BinaryExpression",
      left: {
        type: "Literal",
        value: 1
      },
      operator: "%",
      right: {
        type: "Literal",
        value: 2
      }
    });

    expect(result).to.have.property("right").that.eql({
      type: "Literal",
      value: 3
    });
  });

  it("handles expression in function call", () => {
    const input = "$digest_md5($(REMOTE_ADDR) + $(HTTP_USER_AGENT))";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.have.to.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "digest_md5"
      },
      arguments: [{
        type: "BinaryExpression",
        left: {
          type: "Identifier",
          name: "REMOTE_ADDR"
        },
        operator: "+",
        right: {
          type: "Identifier",
          name: "HTTP_USER_AGENT"
        }
      }]
    });
  });

  it("handles multiple function arguments", () => {
    const input = "$string_split($(HTTP_USER_AGENT), ';', 10)";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.have.to.eql({
      type: "CallExpression",
      callee: {
        type: "Identifier",
        name: "string_split"
      },
      arguments: [{
        type: "Identifier",
        name: "HTTP_USER_AGENT",
      }, {
        type: "Literal",
        value: ";",
      }, {
        type: "Literal",
        value: 10,
      }]
    });
  });

  it("any random string is ok", () => {
    const input = "'string_split HTTP_USER_AGENT,10)'";
    const result = esiExpressionParser(input);

    expect(result).to.have.property("type", "Literal");
    expect(result).to.have.to.eql({
      type: "Literal",
      value: "string_split HTTP_USER_AGENT,10)",
    });
  });

  it("throws unexpected token", () => {
    expect(() => {
      esiExpressionParser("!");
    }).to.throw(SyntaxError, "Unexpected token !");
  });
});
