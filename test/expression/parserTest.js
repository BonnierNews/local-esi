"use strict";

const {parse} = require("../../lib/expression/parser");

describe("parser", () => {
  describe("Identifier", () => {
    it("throws if unclosed", () => {
      const input = "$(someVar";
      expect(() => {
        parse(input);
      }).to.throw(SyntaxError);
    });
  });

  describe("BlockStatement", () => {
    it("throws if unclosed", () => {
      const input = "($(someVar) <= 590";
      expect(() => {
        parse(input);
      }).to.throw(SyntaxError, "Unclosed BlockStatement");
    });
  });

  describe("UnaryExpression", () => {
    it("takes BlockStatement", () => {
      const input = "!(1==2)";
      expect(parse(input)).to.deep.include({
        type: "UnaryExpression",
        operator: "!",
        argument: {
          type: "BlockStatement",
          body: {
            type: "BinaryExpression",
            operator: "==",
            left: {
              type: "Literal",
              value: 1
            },
            right: {
              type: "Literal",
              value: 2
            },
          }
        }
      });
    });
  });

  describe("source map", () => {
    it("returns raw source for empty CallExpression", () => {
      const input = "$time()";
      expect(parse(input, true)).to.deep.include({
        type: "CallExpression",
        raw: input
      });
    });

    it("returns raw source for ArrayExpression", () => {
      const input = "['a', '1', 'b']";
      expect(parse(input, true)).to.deep.include({
        type: "ArrayExpression",
        raw: input
      });
    });

    it("returns raw source for empty ObjectExpression", () => {
      const input = "{}";
      expect(parse(input, true)).to.deep.include({
        type: "ObjectExpression",
        raw: input
      });
    });

    it.skip("returns raw source for ObjectExpression", () => {
      const input = "{'a': 1, 'b': 2}";
      expect(parse(input, true)).to.deep.include({
        type: "ObjectExpression",
        raw: input
      });
    });
  });
});
