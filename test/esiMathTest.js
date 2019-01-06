"use strict";

const {expect} = require("chai");
const localEsi = require("../index");

describe("Basic math tests in test-expressions", () => {
  it("should handle modulo division", (done) => {
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

  it("should handle standard division", (done) => {
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

  it("should handle addition", (done) => {
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

  it("should handle subtraction", (done) => {
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
});
