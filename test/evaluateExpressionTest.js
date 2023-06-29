import { test } from "../lib/evaluateExpression.js";

describe("evaluate expression", () => {
  describe("test expression", () => {
    it("casts equals right to left type", () => {
      const context = { assigns: { var: "true", falsy: "false", myVar: "1" } };
      expect(test("$(var) == true", context)).to.be.true;
      expect(test("true == $(var)", context)).to.be.true;

      expect(test("$(myVar) == 1", context)).to.be.true;
      expect(test("1 == $(myVar)", context)).to.be.true;

      expect(test("$(myVar) == 2", context)).to.be.false;
      expect(test("2 == $(myVar)", context)).to.be.false;

      expect(test("$(var) == false", context)).to.be.false;
      expect(test("false == $(var)", context)).to.be.false;

      expect(test("$(falsy) == true", context)).to.be.false;
      expect(test("true == $(falsy)", context)).to.be.false;

      expect(test("$(falsy) == false", context)).to.be.true;
      expect(test("false == $(falsy)", context)).to.be.true;
    });

    it("casts not equals right to left type", () => {
      const context = { assigns: { var: "true", falsy: "false" } };
      expect(test("$(var) != true", context)).to.be.false;
      expect(test("true != $(var)", context)).to.be.false;

      expect(test("$(var) != false", context)).to.be.true;
      expect(test("false != $(var)", context)).to.be.true;

      expect(test("$(falsy) != true", context)).to.be.true;
      expect(test("true != $(falsy)", context)).to.be.true;

      expect(test("$(falsy) != false", context)).to.be.false;
      expect(test("false != $(falsy)", context)).to.be.false;
    });
  });
});
