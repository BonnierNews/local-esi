"use strict";

const {parse, split} = require("../lib/expression/parser");

describe("parser", () => {
  it("handle binary expression with identifier on left side and literal on right", () => {
    const input = "$(access_granted)=='true'";
    const result = parse(input);
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
    const result = parse(input);
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
    const result = parse(input);

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
    const result = parse(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.have.property("callee").that.eql({
      type: "Identifier",
      name: "time"
    });
    expect(result).to.have.property("arguments").to.eql([]);
  });

  it("should handle unary expression with ! operator", () => {
    const input = "!$exists($(HTTP_COOKIE{'remember_me'}))";
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);
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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);
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
    const result = parse(input);

    expect(result).to.have.property("type", "Literal");
    expect(result).to.have.property("value").that.eql(59);
  });

  it("handles string literal expression2", () => {
    const input = "'jan.bananberg@test.com'";
    const result = parse(input);

    expect(result).to.have.property("type", "Literal");
    expect(result).to.have.property("value").that.eql("jan.bananberg@test.com");
  });

  it("handles binary expression where one expression is a regular expression", () => {
    const input = "$(HTTP_REFERER) matches '''(google|yahoo|bing|yandex)\\.\\d+$'''";
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

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
    const result = parse(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.eql({
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
    const result = parse(input);

    expect(result).to.have.property("type", "CallExpression");
    expect(result).to.eql({
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

  it("almost any random string is ok", () => {
    const input = "'string_split HTTP_USER_AGENT,10)'";
    const result = parse(input);

    expect(result).to.have.property("type", "Literal");
    expect(result).to.eql({
      type: "Literal",
      value: "string_split HTTP_USER_AGENT,10)",
    });
  });

  describe("collection", () => {
    it("empty collection", () => {
      const result = parse("[]");
      expect(result).to.eql({
        type: "ArrayExpression",
        elements: [],
      });
    });

    it("collection with number literals", () => {
      const result = parse("[1, 2]");
      expect(result).to.eql({
        type: "ArrayExpression",
        elements: [{
          type: "Literal",
          value: 1,
        }, {
          type: "Literal",
          value: 2,
        }],
      });
    });

    it("collection with string literals", () => {
      const result = parse("['a', 'b']");
      expect(result).to.eql({
        type: "ArrayExpression",
        elements: [{
          type: "Literal",
          value: "a",
        }, {
          type: "Literal",
          value: "b",
        }],
      });
    });

    it("collection with identifiers", () => {
      const result = parse("[$(someVar1), $(someVar2)]");
      expect(result).to.eql({
        type: "ArrayExpression",
        elements: [{
          type: "Identifier",
          name: "someVar1",
        }, {
          type: "Identifier",
          name: "someVar2",
        }],
      });
    });
  });

  describe("escape", () => {
    it("removes backslash in string", () => {
      let result = parse("'\\Program Files\\Game\\Fun.exe.'");
      expect(result).to.deep.equal({
        type: "Literal",
        value: "Program FilesGameFun.exe.",
      });

      result = parse("'\\\\/my\\\\stuff/'");
      expect(result).to.deep.equal({
        type: "Literal",
        value: "\\/my\\stuff/",
      });
    });

    it("keeps escaped backslash in string", () => {
      const result = parse("'\\\\Program Files\\\\Game\\\\Fun.exe.'");
      expect(result).to.eql({
        type: "Literal",
        value: "\\Program Files\\Game\\Fun.exe.",
      });
    });

    it("keeps backslash in escaped string", () => {
      let result = parse("'''\\Program Files\\Game\\Fun.exe.'''");
      expect(result).to.eql({
        type: "Literal",
        value: "\\Program Files\\Game\\Fun.exe.",
      });

      result = parse("'''\\/my\\stuff/'''");
      expect(result).to.eql({
        type: "Literal",
        value: "\\/my\\stuff/",
      });
    });
  });

  describe("malformated expression", () => {
    it("throws on unexpected keyword", () => {
      expect(() => {
        parse("true");
      }).to.throw(SyntaxError, "Unknown keyword true at 0:0");
    });

    it("throws unexpected token if just unary", () => {
      expect(() => {
        parse("!");
      }).to.throw(SyntaxError, "Unexpected token ! at 0:0");
    });

    it("throws unexpected token if unclosed binary", () => {
      expect(() => {
        parse("$(someVar)==");
      }).to.throw(SyntaxError, "Unexpected token == at 0:10");
    });

    it("throws unexpected token if unclosed logical", () => {
      expect(() => {
        parse("$(someVar) |   ");
      }).to.throw(SyntaxError, "Unexpected token | at 0:11");
    });

    it("throws unexpected token if init binary", () => {
      expect(() => {
        parse("   == $(someVar)");
      }).to.throw(SyntaxError, "Unexpected token == at 0:0");
    });

    it("throws unexpected token if init logical", () => {
      expect(() => {
        parse("| $(someVar)");
      }).to.throw(SyntaxError, "Unexpected token | at 0:0");
    });

    it("throws unexpected token if function arguments are not separated by comma", () => {
      expect(() => {
        parse("$set_response_code(400 '<h1>Err</h1>'");
      }).to.throw(SyntaxError, "Unexpected Literal");
    });

    it("throws unexpected token if array elements are not separated by comma", () => {
      expect(() => {
        parse("[400 500]");
      }).to.throw(SyntaxError, "Unexpected Literal");
    });
  });

  describe("split into text and expressions", () => {
    it("extracts identifier from text", () => {
      const text = "some text surrounding $(var) and beyond";
      const result = split(text);
      expect(result).to.eql([{
        type: "TEXT",
        text: "some text surrounding ",
      }, {
        index: 22,
        raw: "$(var)",
        expression: {
          type: "Identifier",
          raw: "$(var)",
          name: "var"
        }
      }, {
        type: "TEXT",
        text: " and beyond",
      }]);
    });

    it("extracts identifiers from text", () => {
      const text = "some text surrounding $(var1) and before $(var2)";
      const result = split(text);
      expect(result).to.eql([{
        type: "TEXT",
        text: "some text surrounding ",
      }, {
        index: 22,
        raw: "$(var1)",
        expression: {
          type: "Identifier",
          name: "var1",
          raw: "$(var1)",
        }
      }, {
        type: "TEXT",
        text: " and before ",
      }, {
        index: 41,
        raw: "$(var2)",
        expression: {
          type: "Identifier",
          name: "var2",
          raw: "$(var2)",
        }
      }]);
    });

    it("extracts call expression with one argument from text", () => {
      const text = "\n$set_response_code( 401 ) \n";
      const result = split(text);
      expect(result).to.eql([{
        type: "TEXT",
        text: "\n"
      }, {
        index: 1,
        raw: "$set_response_code( 401 )",
        expression: {
          type: "CallExpression",
          callee: {
            type: "Identifier",
            name: "set_response_code"
          },
          arguments: [{
            type: "Literal",
            value: 401,
            raw: " 401",
          }],
          raw: "$set_response_code( 401 )",
        }
      }, {
        type: "TEXT",
        text: " \n"
      }]);
    });

    it("extracts call expression with one argument from text", () => {
      const text = "/mystuff/?a=b&user=$url_encode($(user_email))";
      const result = split(text);
      expect(result).to.deep.equal([{
        type: "TEXT",
        text: "/mystuff/?a=b&user="
      }, {
        index: 19,
        raw: "$url_encode($(user_email))",
        expression: {
          type: "CallExpression",
          callee: {
            type: "Identifier",
            name: "url_encode"
          },
          arguments: [{
            type: "Identifier",
            name: "user_email",
            raw: "$(user_email)",
          }],
          raw: "$url_encode($(user_email))",
        }
      }]);
    });

    it("extracts call expression with two arguments from text", () => {
      const text = "\n$add_header('Set-Cookie', 'MyCookie1=SomeValue; HttpOnly')\n";
      const result = split(text);
      expect(result[1]).to.eql({
        index: 1,
        raw: "$add_header('Set-Cookie', 'MyCookie1=SomeValue; HttpOnly')",
        expression: {
          type: "CallExpression",
          callee: {
            type: "Identifier",
            name: "add_header"
          },
          arguments: [{
            type: "Literal",
            value: "Set-Cookie",
            raw: "'Set-Cookie'",
          }, {
            type: "Literal",
            value: "MyCookie1=SomeValue; HttpOnly",
            raw: " 'MyCookie1=SomeValue; HttpOnly'",
          }],
          raw: "$add_header('Set-Cookie', 'MyCookie1=SomeValue; HttpOnly')",
        }
      });
      expect(result.length).to.equal(3);
    });

    it("extracts member expressions", () => {
      const text = "/mystuff/?a=$(QUERY_STRING{'b'})&user=$(QUERY_STRING{'user'})";
      const result = split(text);
      expect(result[1]).to.deep.equal({
        index: 12,
        raw: "$(QUERY_STRING{'b'})",
        expression: {
          type: "MemberExpression",
          raw: "$(QUERY_STRING{'b'})",
          object: {
            type: "Identifier",
            name: "QUERY_STRING",
          },
          property: {
            type: "Literal",
            value: "b",
            raw: "'b'",
          }
        }
      });
      expect(result[3]).to.deep.equal({
        index: 38,
        raw: "$(QUERY_STRING{'user'})",
        expression: {
          type: "MemberExpression",
          raw: "$(QUERY_STRING{'user'})",
          object: {
            type: "Identifier",
            name: "QUERY_STRING",
          },
          property: {
            type: "Literal",
            value: "user",
            raw: "'user'",
          }
        }
      });
      expect(result.length).to.equal(4);
    });

    it("extracts concatenated expressions", () => {
      const text = "Welcome $(QUERY_STRING{'b'})$(QUERY_STRING{'user'})";
      const result = split(text);
      expect(result[0]).to.deep.equal({
        type: "TEXT",
        text: "Welcome ",
      });
      expect(result[1]).to.deep.include({
        index: 8,
        raw: "$(QUERY_STRING{'b'})",
      });
      expect(result[2]).to.deep.include({
        index: 28,
        raw: "$(QUERY_STRING{'user'})",
      });
      expect(result.length).to.equal(3);
    });
  });
});
