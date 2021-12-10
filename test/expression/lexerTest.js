"use strict";

const {Lexer} = require("../../lib/expression/lexer");

describe("lexer", () => {
  describe("CallExpression", () => {
    it("has start and end parantheses", () => {
      const lexer = new Lexer("$time()");
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
      const lexer = new Lexer("$http_time($time() + 60)");
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
      const lexer = new Lexer("$time");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected end of line at \"$time\" 0:5");
    });

    it("throws SyntaxError if unexpected other char after identifier", () => {
      const lexer = new Lexer("$time)");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected char ) at \"$time)\" 0:5");
    });
  });

  describe("Identifier", () => {
    it("consumes both start and end parantheses", () => {
      const lexer = new Lexer("$(myVar)");
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
      const lexer = new Lexer("$(myVar");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected end of line at \"$(myVar\" 0:7");
    });

    it("throws SyntaxError if unexpected other char after identifier", () => {
      const lexer = new Lexer("$(myVar(");
      expect(() => {
        lexer.get();
      }).to.throw(SyntaxError, "Unexpected char ( at \"$(myVar(\" 0:7");
    });
  });

  describe("ObjectExpression", () => {
    it("consumes both start and end curly brace", () => {
      const lexer = new Lexer("{'myProp': 1}");
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
});
