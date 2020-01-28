"use strict";

const {Lexer} = require("../../lib/expression/lexer");

describe("lexer", () => {
  describe("CallExpression", () => {
    it("has start and end parantheses", () => {
      const lexer = Lexer("$time()");
      expect(lexer.get()).to.deep.include({
        type: "CallExpression",
        cargo: "time",
      });
      expect(lexer.get()).to.deep.include({
        type: ")",
        cargo: ")",
      });
    });

    it("has source map", () => {
      const lexer = Lexer("$http_time($time() + 60)");
      expect(lexer.get()).to.deep.include({
        type: "CallExpression",
        cargo: "http_time",
        loc: {
          source: "$http_time(",
          start: {
            line: 1,
            column: 0,
          },
          end: {
            line: 1,
            column: 11,
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "CallExpression",
        cargo: "time",
        loc: {
          source: "$time(",
          start: {
            line: 1,
            column: 11,
          },
          end: {
            line: 1,
            column: 17,
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: ")",
        cargo: ")",
        loc: {
          source: ") ",
          start: {
            line: 1,
            column: 17,
          },
          end: {
            line: 1,
            column: 19,
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "+",
        cargo: "+",
        loc: {
          source: "+ ",
          start: {
            line: 1,
            column: 19,
          },
          end: {
            line: 1,
            column: 21,
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "60",
        loc: {
          source: "60",
          start: {
            line: 1,
            column: 21,
          },
          end: {
            line: 1,
            column: 23,
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: ")",
        cargo: ")",
        loc: {
          source: ")",
          start: {
            line: 1,
            column: 23,
          },
          end: {
            line: 1,
            column: 24,
          }
        }
      });
    });

    it("throws SyntaxError if not followed by start parantheses", () => {
      const lexer = Lexer("$time");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected end of line");
    });

    it("throws SyntaxError if unexpected other char after identifier", () => {
      const lexer = Lexer("$time)");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected char ) at 0:5");
    });
  });

  describe("Identifier", () => {
    it("consumes both start and end parantheses", () => {
      const lexer = Lexer("$(myVar)");
      expect(lexer.get()).to.deep.include({
        type: "Identifier",
        cargo: "myVar",
        loc: {
          source: "$(myVar)",
          start: {
            line: 1,
            column: 0,
          },
          end: {
            line: 1,
            column: 8
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "EOL",
      });
    });

    it("throws SyntaxError if not followed by start parantheses", () => {
      const lexer = Lexer("$(myVar");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected end of line");
    });

    it("throws SyntaxError if unexpected other char after identifier", () => {
      const lexer = Lexer("$(myVar(");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected char ( at 0:7");
    });
  });

  describe("ObjectExpression", () => {
    it("consumes both start and end curly brace", () => {
      const lexer = Lexer("{'myProp': 1}");
      expect(lexer.get()).to.deep.include({
        type: "ObjectExpression",
        cargo: "{",
        loc: {
          source: "{",
          start: {
            line: 1,
            column: 0,
          },
          end: {
            line: 1,
            column: 1
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myProp",
        loc: {
          source: "'myProp'",
          start: {
            line: 1,
            column: 1,
          },
          end: {
            line: 1,
            column: 9
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: ":",
        cargo: ":",
        loc: {
          source: ": ",
          start: {
            line: 1,
            column: 9,
          },
          end: {
            line: 1,
            column: 11
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "1",
        loc: {
          source: "1",
          start: {
            line: 1,
            column: 11,
          },
          end: {
            line: 1,
            column: 12
          }
        }
      });
      expect(lexer.get()).to.deep.include({
        type: "}",
        cargo: "}",
        loc: {
          source: "}",
          start: {
            line: 1,
            column: 12,
          },
          end: {
            line: 1,
            column: 13
          }
        }
      });
    });
  });

  describe.skip("source map", () => {
    it("token keeps start source for empty call expression", () => {
      const lexer = Lexer("$time()", true);
      expect(lexer.get()).to.deep.include({
        type: "CallExpression",
        cargo: "time",
        raw: "$time("
      });
    });

    it("returns end source for empty call expression", () => {
      const lexer = Lexer("$time()", true);
      expect(lexer.get()).to.have.property("type", "CallExpression");
      expect(lexer.get()).to.deep.include({
        type: ")",
        raw: ")"
      });
    });

    it("returns source for call expression with arguments", () => {
      const lexer = Lexer("$add_header('x-test-lexer', 'true')", true);
      expect(lexer.get()).to.have.property("type", "CallExpression");
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "x-test-lexer",
        raw: "'x-test-lexer'",
      });
      expect(lexer.get()).to.deep.include({
        type: ",",
        cargo: ",",
        raw: ",",
      });
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "true",
        raw: " 'true'",
      });
    });

    it("returns source for identifier", () => {
      const lexer = Lexer("$(myVar)", true);
      expect(lexer.get()).to.deep.include({
        type: "Identifier",
        cargo: "myVar",
        raw: "$(myVar)"
      });
    });

    it("returns source for member expression", () => {
      const lexer = Lexer("$(myVar{'myProp'})", true);
      expect(lexer.get()).to.deep.include({
        type: "MemberExpression",
        cargo: "myVar",
        raw: "$(myVar{"
      });
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myProp",
        raw: "'myProp'"
      });
      expect(lexer.get()).to.deep.include({
        type: "}",
        cargo: "}",
        raw: "}"
      });
      expect(lexer.get()).to.deep.include({
        type: ")",
        cargo: ")",
        raw: ")"
      });
    });

    it("returns source for literal string", () => {
      const lexer = Lexer("'myValue'", true);
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myValue",
        raw: "'myValue'"
      });
    });

    it("returns source for literal escaped string", () => {
      const lexer = Lexer("'''myValue'''", true);
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myValue",
        raw: "'''myValue'''"
      });
    });

    it("returns source for literal number", () => {
      const lexer = Lexer("99", true);
      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "99",
        raw: "99"
      });
    });

    it("returns source for empty array", () => {
      const lexer = Lexer("[]", true);
      expect(lexer.get()).to.deep.include({
        type: "ArrayExpression",
        cargo: "[",
        raw: "["
      });

      expect(lexer.get()).to.deep.include({
        type: "]",
        cargo: "]",
        raw: "]"
      });
    });

    it("returns source for array with numbers", () => {
      const lexer = Lexer("[1, 2]", true);
      expect(lexer.get()).to.deep.include({
        type: "ArrayExpression",
        cargo: "[",
        raw: "["
      });

      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "1",
        raw: "1"
      });

      expect(lexer.get()).to.deep.include({
        type: ",",
        cargo: ",",
        raw: ","
      });

      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "2",
        raw: " 2"
      });

      expect(lexer.get()).to.deep.include({
        type: "]",
        cargo: "]",
        raw: "]"
      });
    });

    it("returns source for array with literals", () => {
      const lexer = Lexer("['a', '''b''']", true);
      expect(lexer.get()).to.deep.include({
        type: "ArrayExpression",
        cargo: "[",
        raw: "["
      });

      expect(lexer.get()).to.deep.include({
        type: "Literal",
        raw: "'a'"
      });

      expect(lexer.get()).to.deep.include({
        type: ",",
        cargo: ",",
        raw: ","
      });

      expect(lexer.get()).to.deep.include({
        type: "Literal",
        raw: " '''b'''"
      });

      expect(lexer.get()).to.deep.include({
        type: "]",
        raw: "]"
      });
    });

    it("returns source for ObjectExpression", () => {
      const lexer = Lexer("{'a': 1, 'b': 2}", true);
      expect(lexer.get()).to.deep.include({
        type: "ObjectExpression",
        raw: "{",
      });
      expect(lexer.get()).to.include({
        type: "Literal",
        raw: "'a'",
      });
      expect(lexer.get()).to.include({
        type: ":",
        raw: ":",
      });
      expect(lexer.get()).to.include({
        type: "Number",
        raw: " 1",
      });
      expect(lexer.get()).to.include({
        type: ",",
        raw: ",",
      });
      expect(lexer.get()).to.include({
        type: "Literal",
        raw: " 'b'",
      });
      expect(lexer.get()).to.include({
        type: ":",
        raw: ":",
      });
      expect(lexer.get()).to.include({
        type: "Number",
        raw: " 2",
      });
      expect(lexer.get()).to.include({
        type: "}",
        raw: "}",
      });
    });
  });
});
