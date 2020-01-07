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

  describe("source map", () => {
    it("token keeps start source for empty call expression", () => {
      const lexer = Lexer("$time()", true);
      expect(lexer.get()).to.deep.include({
        type: "CallExpression",
        cargo: "time",
        source: "$time("
      });
    });

    it("returns end source for empty call expression", () => {
      const lexer = Lexer("$time()", true);
      expect(lexer.get()).to.have.property("type", "CallExpression");
      expect(lexer.get()).to.deep.include({
        type: ")",
        source: ")"
      });
    });

    it("returns source for call expression with arguments", () => {
      const lexer = Lexer("$add_header('x-test-lexer', 'true')", true);
      expect(lexer.get()).to.have.property("type", "CallExpression");
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "x-test-lexer",
        source: "'x-test-lexer'",
      });
      expect(lexer.get()).to.deep.include({
        type: ",",
        cargo: ",",
        source: ",",
      });
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "true",
        source: " 'true'",
      });
    });

    it("returns source for identifier", () => {
      const lexer = Lexer("$(myVar)", true);
      expect(lexer.get()).to.deep.include({
        type: "Identifier",
        cargo: "myVar",
        source: "$(myVar)"
      });
    });

    it("returns source for member expression", () => {
      const lexer = Lexer("$(myVar{'myProp'})", true);
      expect(lexer.get()).to.deep.include({
        type: "MemberExpression",
        cargo: "myVar",
        source: "$(myVar{"
      });
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myProp",
        source: "'myProp'"
      });
      expect(lexer.get()).to.deep.include({
        type: "}",
        cargo: "}",
        source: "}"
      });
      expect(lexer.get()).to.deep.include({
        type: ")",
        cargo: ")",
        source: ")"
      });
    });

    it("returns source for literal string", () => {
      const lexer = Lexer("'myValue'", true);
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myValue",
        source: "'myValue'"
      });
    });

    it("returns source for literal escaped string", () => {
      const lexer = Lexer("'''myValue'''", true);
      expect(lexer.get()).to.deep.include({
        type: "Literal",
        cargo: "myValue",
        source: "'''myValue'''"
      });
    });

    it("returns source for literal number", () => {
      const lexer = Lexer("99", true);
      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "99",
        source: "99"
      });
    });

    it("returns source for empty array", () => {
      const lexer = Lexer("[]", true);
      expect(lexer.get()).to.deep.include({
        type: "ArrayExpression",
        cargo: "[",
        source: "["
      });

      expect(lexer.get()).to.deep.include({
        type: "]",
        cargo: "]",
        source: "]"
      });
    });

    it("returns source for array with numbers", () => {
      const lexer = Lexer("[1, 2]", true);
      expect(lexer.get()).to.deep.include({
        type: "ArrayExpression",
        cargo: "[",
        source: "["
      });

      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "1",
        source: "1"
      });

      expect(lexer.get()).to.deep.include({
        type: ",",
        cargo: ",",
        source: ","
      });

      expect(lexer.get()).to.deep.include({
        type: "Number",
        cargo: "2",
        source: " 2"
      });

      expect(lexer.get()).to.deep.include({
        type: "]",
        cargo: "]",
        source: "]"
      });
    });

    it("returns source for array with literals", () => {
      const lexer = Lexer("['a', '''b''']", true);
      expect(lexer.get()).to.deep.include({
        type: "ArrayExpression",
        cargo: "[",
        source: "["
      });

      expect(lexer.get()).to.deep.include({
        type: "Literal",
        source: "'a'"
      });

      expect(lexer.get()).to.deep.include({
        type: ",",
        cargo: ",",
        source: ","
      });

      expect(lexer.get()).to.deep.include({
        type: "Literal",
        source: " '''b'''"
      });

      expect(lexer.get()).to.deep.include({
        type: "]",
        source: "]"
      });
    });
  });
});
