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

  describe("Literal", () => {
    it("should return boolean true", () => {
      const input = "true";
      expect(parse(input)).to.deep.equal({
        type: "Literal",
        value: true
      });
    });

    it("should return boolean false", () => {
      const input = "false";
      expect(parse(input)).to.deep.equal({
        type: "Literal",
        value: false
      });
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

  describe("ObjectExpression", () => {
    it("happy trail", () => {
      const input = "{'a': 1, 'b': 2}";
      const object = parse(input);
      expect(object).to.deep.equal({
        type: "ObjectExpression",
        properties: [{
          type: "Property",
          key: {
            type: "Identifier",
            name: "a"
          },
          value: {
            type: "Literal",
            value: 1,
          }
        }, {
          type: "Property",
          key: {
            type: "Identifier",
            name: "b"
          },
          value: {
            type: "Literal",
            value: 2,
          }
        }]
      });
    });

    it("empty object", () => {
      const input = "{}";
      const object = parse(input);
      expect(object).to.deep.equal({
        type: "ObjectExpression",
        properties: [],
      });
    });

    it("value with BlockStatement", () => {
      const input = "{'a': 1, 0: 2, 'c': (1 < 2)}";
      const object = parse(input);
      expect(object).to.deep.equal({
        type: "ObjectExpression",
        properties: [{
          type: "Property",
          key: {
            type: "Identifier",
            name: "a"
          },
          value: {
            type: "Literal",
            value: 1,
          }
        }, {
          type: "Property",
          key: {
            type: "Identifier",
            name: 0
          },
          value: {
            type: "Literal",
            value: 2,
          }
        }, {
          type: "Property",
          key: {
            type: "Identifier",
            name: "c"
          },
          value: {
            type: "BlockStatement",
            body: {
              type: "BinaryExpression",
              operator: "<",
              left: {
                type: "Literal",
                value: 1,
              },
              right: {
                type: "Literal",
                value: 2,
              }
            },
          }
        }],
      });
    });

    it("throws if unclosed", () => {
      const input = "{'a': 1, 'b': 2";
      expect(() => {
        parse(input);
      }).to.throw(SyntaxError, "Unclosed ObjectExpression");
    });

    it("throws if key is not literal", () => {
      const input = "{$(key): 1, 'b' 2}";
      expect(() => {
        parse(input);
      }).to.throw(SyntaxError, "Unexpected key");
    });

    it("throws if missing colon between key and value", () => {
      const input = "{'a': 1, 'b' 2}";
      expect(() => {
        parse(input);
      }).to.throw(SyntaxError, "Unexpected Literal in object");
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

    it("returns raw source for ObjectExpression", () => {
      const input = "{'a': 1, 'b': 2}";
      expect(parse(input, true)).to.deep.include({
        type: "ObjectExpression",
        raw: input
      });
    });
  });
});
