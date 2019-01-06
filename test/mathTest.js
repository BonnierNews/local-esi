"use strict";

const {expect} = require("chai");
const localEsi = require("../index");

describe("local ESI", () => {

  describe("Math", () => {

    it("should know that 4 % 2 is 0 in test-expressions", (done) => {
      const markup = `
        <esi:choose>
        <esi:when test="4 % 2 == 0">
          Ja
        </esi:when>
        <esi:otherwise>
          Nej
        </esi:otherwise>
      </esi:choose>
      `;
      const expectedMarkup = "Ja";

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle plus in test expressions", (done) => {
      const markup = `
        <esi:choose>
        <esi:when test="4 + 2 == 6">
          Ja
        </esi:when>
        <esi:otherwise>
          Nej
        </esi:otherwise>
      </esi:choose>
      `;
      const expectedMarkup = "Ja";

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle division in test-expressions", (done) => {
      const markup = `
        <esi:choose>
        <esi:when test="100 / 10 == 7">
          Ja
        </esi:when>
        <esi:otherwise>
          Nej
        </esi:otherwise>
      </esi:choose>
      `;
      const expectedMarkup = "Nej";

      localEsi(markup, {}, {
        send(body) {
          expect(body.trim()).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });
});
