"use strict";

const {expect} = require("chai");
const localEsi = require("../index");
const nock = require("nock");

describe("local ESI", () => {

  it("should not touch regular markup", (done) => {
    const markup = "<!DOCTYPE html><html><head><title>This is a title</title></head><body>Test: <b>Testsson</b></body></html>";
    localEsi(markup, {}, {
      send(body) {
        expect(body).to.equal(markup);
        done();
      }
    }, done);
  });

  describe("esi:choose", () => {
    it("should render the otherwise statement of an esi:choose when not matching our specific test", (done) => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="$exists($(HTTP_COOKIE{'someCookie'})) | $exists($(HTTP_COOKIE{'someOtherCookie'}))">`; //eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>Otherwise</pre>";

      localEsi(markup, { cookies: { someThirdCookie: "no" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should render the when statement of an esi:choose when testing existance of assigned esi variable", (done) => {
      let markup = "<esi:assign name=\"user_email\" value=\"jan.bananberg@test.com\"/>";
      markup += "<esi:choose>";
      markup += `<esi:when test="$exists($(user_email))">`; //eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>When</pre>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should render the otherwise statement of an esi:choose when missing assigned esi variable", (done) => {
      let markup = "<esi:choose>";
      markup += `<esi:when test="$exists($(user_email))">`; //eslint-disable-line quotes
      markup += "<pre>When</pre>";
      markup += "</esi:when>";
      markup += "<esi:otherwise>";
      markup += "<pre>Otherwise</pre>";
      markup += "</esi:otherwise>";
      markup += "</esi:choose>";

      const expectedMarkup = "<pre>Otherwise</pre>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle test of assigned variable value", (done) => {
      const markup = `<esi:assign name="someVar" value="true" />
      <esi:choose>
        <esi:when test="$(someVar)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <p>då</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>hej</p>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not evaluate nested choose when in otherwise if first test evaluates to true", (done) => {
      const markup = `<esi:assign name="blahonga" value="true" />
      <esi:choose>
        <esi:when test="$(blahonga)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <esi:choose>
            <esi:when test="$exists($(user_email))">
              <p>hej igen</p>
            </esi:when>
            <esi:otherwise>
              <p>då</p>
            </esi:otherwise>
          </esi:choose>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>hej</p>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle nested choose in when when test evaluates to true", (done) => {
      const markup = `<esi:assign name="var_a" value="true" />
      <esi:choose>
        <esi:when test="$(var_a)=='true'">
          <esi:choose>
            <esi:when test="$exists($(user_email))">
              <p>hej</p>
            </esi:when>
            <esi:otherwise>
              <p>då</p>
            </esi:otherwise>
          </esi:choose>
        </esi:when>
        <esi:otherwise>
          <p>då igen</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>då</p>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support OR test when first criteria is true", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
            <p>Approved</p>
          </esi:when>
          <esi:otherwise>
            <p>Rejected</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Approved</p>";
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support OR test when second criteria is true", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
            <p>Approved</p>
          </esi:when>
          <esi:otherwise>
            <p>Rejected</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Approved</p>";
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support OR test when no criteria is true", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
            <p>Approved</p>
          </esi:when>
          <esi:otherwise>
            <p>Rejected</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Rejected</p>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support test with unary expression", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="!$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>Rejected</p>
          </esi:when>
          <esi:otherwise>
            <p>Approved</p>
          </esi:otherwise>
        </esi:choose>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Rejected</p>";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when when both are true", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="!$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="!$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>First when</p>";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when where the first evaluates to false", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="!$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Second when</p>";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when and otherwise where both whens are false", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
          <esi:otherwise>
            <p>Otherwise</p>
          </esi:otherwise>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Otherwise</p>";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support choose with multiple when and otherwise where the first when is true", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="!$exists($(HTTP_COOKIE{'cookie1'}))">
            <p>First when</p>
          </esi:when>
          <esi:when test="$exists($(HTTP_COOKIE{'some_cookie'}))">
            <p>Second when</p>
          </esi:when>
          <esi:otherwise>
            <p>Otherwise</p>
          </esi:otherwise>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>First when</p>";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with &&", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_COOKIE{'intCookie'}) == 1 && $(HTTP_COOKIE{'intCookie'}) == 59">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with int function call", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) == 1">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 1 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support when test with >= and <=", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$int($(HTTP_COOKIE{'int_cookie'})) >= 1 && $int($(HTTP_COOKIE{'int_cookie'})) <= 59">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 50 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle multiple unneeded parentheses", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="($int($(HTTP_COOKIE{'int_cookie'})) >= 1) && ($int($(HTTP_COOKIE{'int_cookie'})) <= 59)">
            <p>Hej</p>
          </esi:when>
      </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { cookies: { "int_cookie": 50 } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle QUERY_STRING", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='blahong'">
            <p>Hej</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { query: { q: "blahong" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle HTTP HEADER", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_HOST)=='http://www.example.com'">
            <p>Welcome to example.com</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Welcome to example.com</p>";
      localEsi(markup, { headers: { "host": "http://www.example.com" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should handle custom HTTP HEADER", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(HTTP_X_CUSTOM_HEADER)'">
            <p>Custom header identified</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Custom header identified</p>";
      localEsi(markup, { headers: { "x-custom-header": "My header value" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });

  it("should fetch and evaluate esi:eval", (done) => {
    const markup = "<div><esi:eval src=\"http://mystuff/\" dca=\"none\"/></div>";
    const evalResponse = `<esi:choose>
      <esi:when test="$exists($(HTTP_COOKIE{'cookie_1'})) | $exists($(HTTP_COOKIE{'cookie_2'}))">
      </esi:when>
      <esi:otherwise>
        <p>hej</p>
      </esi:otherwise>
    </esi:choose>`.replace(/^\s+|\n/gm, "");

    nock("http://mystuff")
      .get("/")
      .reply(200, evalResponse);
    const expectedMarkup = "<div><p>hej</p></div>";

    localEsi(markup, { }, {
      send(body) {
        expect(body).to.equal(expectedMarkup);
        done();
      }
    }, done);
  });

  it("should call next with error when the trying to include a URL where the path doesn't end with /", (done) => {
    const markup = "<esi:include src=\"/mystuff\" dca=\"none\"/>";

    localEsi(markup, { }, {
      send() {
        done(new Error("We should not be here"));
      }
    }, (err) => {
      expect(err).to.not.be.undefined;
      expect(err).to.not.be.null;
      expect(err.message).to.contain("path");
      done();
    });
  });

  describe("esi:include", () => {
    it("should fetch and insert esi:include with relative url when dca=none", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p><esi:vars>hej</esi:vars></p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should fetch and evaluate esi:include with relative url when dca=esi", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234", {
        reqheaders: { cookie: "da_cookie=cookie_value"}
      })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        },
        headers: {
          cookie: "da_cookie=cookie_value"
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should fetch and evaluate esi:include with absolute url", (done) => {
      const markup = "<esi:include src=\"http://mystuff.com/\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", {
        reqheaders: { host: "mystuff.com"}
      })
        .get("/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should handle include source query parameters", (done) => {
      let markup = "<esi:assign name=\"user_email\" value=\"sammy_g@test.com\"/>";
      markup += "<esi:include src=\"/mystuff/?a=b&user=$url_encode($(user_email))\" dca=\"esi\"/>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .query({
          a: "b",
          user: "sammy_g@test.com"
        })
        .reply(200, "<p>hej</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p>");
          done();
        }
      }, done);
    });

    it("should handle errors when esi:including using esi:try", (done) => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"none\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
          done();
        }
      }, done);
    });

    it("should handle errors when esi:including using esi:try and dca=esi", (done) => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"esi\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>Hej kom och hjälp mig!</p>");
          done();
        }
      }, done);
    });

    it("should handle successfull response when esi:including using esi:try", (done) => {
      let markup = "<p>innan</p>";
      markup += "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff/\" dca=\"none\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";
      markup += "<p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p>Frid och fröjd</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>innan</p><p>Frid och fröjd</p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should call next with error when the response to an esi:include returns 500 (outside try/attempt)", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(500, "<p>Error</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send() {
          done(new Error("We should not be here"));
        }
      }, (err) => {
        expect(err).to.not.be.undefined;
        expect(err).to.not.be.null;
        done();
      });
    });

    it("should handle re-assign variable value from esi:eval", (done) => {
      const markup = `<esi:assign name="some_variable" value="true" />
      <esi:eval src="http://mystuff/" dca="none"/>
      <esi:choose>
        <esi:when test="$(some_variable)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <p>då</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const evalResponse = "<esi:assign name=\"some_variable\" value=\"false\" />".replace(/^\s+|\n/gm, "");

      nock("http://mystuff")
        .get("/")
        .reply(200, evalResponse);

      const expectedMarkup = "<p>då</p>";

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not execute esi:assign from esi:include in the original scope", (done) => {
      const markup = `<esi:assign name="some_variable" value="true" />
      <esi:include src="http://mystuff/" dca="esi"/>
      <esi:choose>
        <esi:when test="$(some_variable)=='true'">
          <p>hej</p>
        </esi:when>
        <esi:otherwise>
          <p>då</p>
        </esi:otherwise>
      </esi:choose>`.replace(/^\s+|\n/gm, "");

      const includeResponse = `<esi:assign name="some_variable" value="false" />
          <esi:choose>
          <esi:when test="$(some_variable)=='true'">
            <p>hej</p>
          </esi:when>
          <esi:otherwise>
            <p>då</p>
          </esi:otherwise>
        </esi:choose>`.replace(/^\s+|\n/gm, "");

      nock("http://mystuff")
        .get("/")
        .reply(200, includeResponse);

      const expectedMarkup = "<p>då</p><p>hej</p>";
      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should add header when instructed from included source when dca=esi", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"esi\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars>");

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        cookie,
        send(body) {
          expect(body).to.equal("<p>efter</p>");
          expect(cookies).to.have.property("my_cookie", "val1");
          done();
        }
      }, done);
    });

    it("should not add header when instructed from included source when dca=none", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars>");

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        cookie,
        send(body) {
          expect(body).to.equal("<esi:vars>$add_header('Set-Cookie', 'my_cookie=val1; path=/; HttpOnly')</esi:vars><p>efter</p>");
          expect(cookies).to.not.have.property("my_cookie");
          done();
        }
      }, done);
    });

    it("should call next with error when the trying to include a URL where the path doesn't end with /, even when in esi:try", (done) => {
      let markup = "<esi:try>";
      markup += "<esi:attempt>";
      markup += "<esi:include src=\"/mystuff\" dca=\"none\"/>";
      markup += "</esi:attempt>";
      markup += "<esi:except>";
      markup += "<p>Hej kom och hjälp mig!</p>";
      markup += "</esi:except>";
      markup += "</esi:try>";

      localEsi(markup, { }, {
        send() {
          done(new Error("We should not be here"));
        }
      }, (err) => {
        expect(err).to.not.be.undefined;
        expect(err).to.not.be.null;
        expect(err.message).to.contain("path");
        done();
      });
    });

    it("should fetch without content-type header when using esi:include", (done) => {
      const markup = "<esi:include src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234", {
        badheaders: ["content-type", "application/x-www-form-urlencoded"]
      })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        },
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        }
      }, {
        send(body) {
          expect(body).to.equal("<p><esi:vars>hej</esi:vars></p><p>efter</p>");
          done();
        }
      }, done);
    });

    it("should fetch without content-type header when using esi:eval", (done) => {
      const markup = "<esi:eval src=\"/mystuff/\" dca=\"none\"/><p>efter</p>";

      nock("http://localhost:1234", {
        badheaders: ["content-type", "application/x-www-form-urlencoded"]
      })
        .get("/mystuff/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        },
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        }
      }, {
        send() {
          done();
        }
      }, done);
    });

    it("should support esi:include when url is from variable", (done) => {
      let markup = "<esi:assign name=\"daurl\" value=\"http://mystuff.com/\"/>";
      markup += "<esi:include src=\"$(daurl)\" dca=\"esi\"/><p>efter</p>";

      nock("http://mystuff.com", {
        reqheaders: { host: "mystuff.com"}
      })
        .get("/")
        .reply(200, "<p><esi:vars>hej</esi:vars></p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });
  });

  describe("esi:choose", () => {
    it("supports nested esi:choose when all match", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='1'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>Hej</p>
              </esi:when>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "<p>Hej</p>";
      localEsi(markup, { query: { q: "1", p: "1"} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should not render anything if outer choose is false", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='0'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='0'">
                <p>1</p>
              </esi:when>
              <esi:otherwise>
                <p>2</p>
              </esi:otherwise>
            </esi:choose>

            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>3</p>
              </esi:when>
              <esi:otherwise>
                <p>4</p>
              </esi:otherwise>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      localEsi(markup, { query: { q: "1", p: "1"} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });


    it("should not render anything if outer choose is false (very nested chooses)", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='0'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='0'">
                <esi:choose>
                  <esi:when test="$(QUERY_STRING{'p'})=='1'">
                    <p>3</p>
                  </esi:when>
                  <esi:otherwise>
                    <p>4</p>
                  </esi:otherwise>
                </esi:choose>
                <esi:choose>
                  <esi:when test="$(QUERY_STRING{'p'})=='1'">
                    <p>3</p>
                  </esi:when>
                  <esi:otherwise>
                    <p>4</p>
                  </esi:otherwise>
                </esi:choose>
              </esi:when>
              <esi:otherwise>
                <p>2</p>
              </esi:otherwise>
            </esi:choose>

            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>3</p>
              </esi:when>
              <esi:otherwise>
                <p>4</p>
              </esi:otherwise>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "";
      localEsi(markup, { query: { q: "1", p: "1"} }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });


    it("hides nested esi:choose outcome if first level evaluates to false", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$(QUERY_STRING{'q'})=='1'">
            <esi:choose>
              <esi:when test="$(QUERY_STRING{'p'})=='1'">
                <p>Hej</p>
              </esi:when>
            </esi:choose>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { query: { q: "2", p: "1"} }, {
        send(body) {
          expect(body).to.equal("");
          done();
        }
      }, done);
    });
  });

  describe("esi:text", () => {
    it("supports esi:text", (done) => {
      const markup = "<esi:text>This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.</esi:text>";

      const expectedMarkup = "This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.";
      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("supports esi:text inside esi:choose", (done) => {
      const markup = "<esi:choose><esi:when test=\"$(QUERY_STRING{'q'})=='blahong'\"><esi:text>This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.</esi:text></esi:when></esi:choose>";

      const expectedMarkup = "This text can include dollar signs $, quotes \"’’\" or any other flat text, and it will not be interpreted or encoded by ESI.";
      localEsi(markup, { query: { q: "blahong" }}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("supports esi:text with JSON containg escaped citation inside esi:choose", (done) => {
      const json = {"test": "[\"BI_News\"]" };
      const markup = `<esi:choose>
      <esi:when test="1==1">
      <esi:text>${JSON.stringify(json)}</esi:text>
      </esi:when>
      </esi:choose>`;

      localEsi(markup, {}, {
        send(body) {
          try {
            const object = JSON.parse(body);
            expect(object).to.eql(json);
            done();
          } catch (error) {
            done(error);
          }
        }
      });
    });
  });

  describe("$add_header", () => {
    it("should set cookies when instructed", (done) => {
      let markup = "<esi:vars>";
      markup += "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";
      markup += "</esi:vars>";

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(cookies).to.have.property("MyCookie1", "SomeValue");
          done();
        }
      }, done);
    });

    it("should set multiple cookies when instructed", (done) => {
      let markup = "<esi:vars>";
      markup += "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";
      markup += "$add_header('Set-Cookie', 'MyCookie2=SomeValue2; Htt')";
      markup += "</esi:vars>";

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(cookies).to.have.property("MyCookie1", "SomeValue");
          expect(cookies).to.have.property("MyCookie2", "SomeValue2");
          done();
        }
      }, done);
    });

    it("should NOT set cookies when instructed outside an ESI tag", (done) => {
      const markup = "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal(markup);
          expect(cookies).to.not.have.property("MyCookie1");
          done();
        }
      }, done);
    });

    it("should set cookies when instructed in esi:choose", (done) => {
      const markup = `
        <esi:assign name="authorized" value="true"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            $add_header('Set-Cookie', 'MyCookie1=SomeValue;')
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(authorized)=='false'">
          </esi:when>
          <esi:otherwise>
            $add_header('Set-Cookie', 'MyCookie2=SomeValue2;')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(cookies).to.have.property("MyCookie1", "SomeValue");
          expect(cookies).to.have.property("MyCookie2", "SomeValue2");
          done();
        }
      }, done);
    });

    it("should not set cookies when in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="false"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            $add_header('Set-Cookie', 'MyCookie1=SomeValue;')
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const cookies = {};
      function cookie(name, value) {
        cookies[name] = value;
      }

      localEsi(markup, { }, {
        cookie,
        send(body) {
          expect(body).to.equal("");
          expect(cookies).to.not.have.property("MyCookie1", "SomeValue");
          done();
        }
      }, done);
    });
  });

  describe("$set_response_code", () => {
    it("supports $set_response_code with status as only parameter", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code( 401 )
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(401);
          done();
        }
      }, done);
    });

    it("supports $set_response_code with status and replacement markup", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code(400, '<p>hej</p>')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>hej</p>");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it.skip("supports $set_response_code with status and replacement markup containing what looks like the end of the statement", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code(400, '<p>')</p>')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>')</p>");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it("supports $set_response_code with status and replacement string", (done) => {
      const markup = `
        <esi:vars>
          $set_response_code(400, 'OK')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("OK");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(400);
          done();
        }
      }, done);
    });

    it("supports $set_response_code in esi:choose", (done) => {
      const markup = `
        <esi:assign name="authorized" value="false"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401, '<p>Unauthorized</p>')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>Unauthorized</p>");
          expect(setStatus).to.not.be.undefined;
          expect(setStatus).to.equal(401);
          done();
        }
      }, done);
    });

    it("should not set response code in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="true"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401)
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>Content for you</p>");
          expect(setStatus).to.be.undefined;
          done();
        }
      }, done);
    });

    it("should not set response code or modify body when in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="true"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401, '<p>Unauthorized</p>')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let setStatus;
      localEsi(markup, { }, {
        status(status) {
          setStatus = status;
        },
        send(body) {
          expect(body).to.equal("<p>Content for you</p>");
          expect(setStatus).to.be.undefined;
          done();
        }
      }, done);
    });
  });

  describe("$set_redirect", () => {
    it("supports $set_redirect", (done) => {
      const markup = `
        <esi:vars>
          $set_redirect('https://blahonga.com')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      let redirectUrl;
      localEsi(markup, { }, {
        redirect(url) {
          redirectUrl = url;
          expect(redirectUrl).to.equal("https://blahonga.com");
          done();
        },
        send: done
      });
    });

    it("supports $set_redirect in esi:choose", (done) => {
      const markup = `
        <esi:assign name="authorized" value="false"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_redirect('https://blahonga.com')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let redirectUrl;
      localEsi(markup, { }, {
        redirect(url) {
          redirectUrl = url;
          expect(redirectUrl).to.equal("https://blahonga.com");
          done();
        }
      });
    });

    it("should evaluate nested multiple chooses when first test evaluates to true", (done) => {
      const markup = `<esi:assign name="blahonga" value="true" />
        <esi:choose>
          <esi:when test="$(blahonga)=='true'">
            <esi:choose>
              <esi:when test="$exists($(HTTP_COOKIE{'cookie1'})) | $exists($(HTTP_COOKIE{'cookie2'}))">
                <p>hej 1</p>
              </esi:when>
              <esi:otherwise>
                <p>då 1</p>
              </esi:otherwise>
            </esi:choose>
            <esi:choose>
              <esi:when test="$exists($(HTTP_COOKIE{'cookie3'})) | $exists($(HTTP_COOKIE{'cookie4'}))">
                <p>hej 2</p>
              </esi:when>
              <esi:otherwise>
                <p>då 2</p>
              </esi:otherwise>
            </esi:choose>
          </esi:when>
          <esi:otherwise>
            <p>hej igen</p>
          </esi:otherwise>
        </esi:choose>`.replace(/^\s+|\n/gm, "");
      const expectedMarkup = "<p>hej 1</p><p>då 2</p>";
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });


    it("should not set redirect in esi:choose clause that doesn't match", (done) => {
      const markup = `
        <esi:assign name="authorized" value="true"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
          $set_redirect('https://blahonga.com')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      let redirectUrl;
      localEsi(markup, { }, {
        redirect(url) {
          redirectUrl = url;
        },
        send(body) {
          expect(body).to.equal("<p>Content for you</p>");
          expect(redirectUrl).to.be.undefined;
          done();
        }
      }, done);
    });
  });

  describe("$base64", () => {
    it("supports $base64_encode", (done) => {
      const markup = `
        <esi:assign name="str" value="Sean@Banan!"/>
        <esi:choose>
          <esi:when test="$base64_encode($(str)) == 'U2VhbkBCYW5hbiE='"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports $base64_decode", (done) => {
      const markup = `
        <esi:assign name="str" value="U2VhbkBCYW5hbiE="/>
        <esi:choose>
          <esi:when test="$base64_decode($(str)) == 'Sean@Banan!'"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("handles base64_decode with undefined value", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$base64_decode($(str)) == 'Sean@Banan!'"/>
            <p>true</p>
          </esi:when>
          <esi:otherwise>
            <p>false</p>
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>false</p>");
          done();
        }
      }, done);
    });

    it("handles base64_encode with undefined value", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="$base64_encode($(str)) == 'Sean@Banan!'"/>
            <p>true</p>
          </esi:when>
          <esi:otherwise>
            <p>false</p>
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>false</p>");
          done();
        }
      }, done);
    });
  });

  describe("$index", () => {
    it("supports $index", (done) => {
      const markup = `
        <esi:assign name="str" value="Sean@Banan!"/>
        <esi:choose>
          <esi:when test="$index($(str), 'Banan') > -1"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$index($(str), 'Apple') < 0"/>
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p><p>true again</p>");
          done();
        }
      }, done);
    });
  });

  describe("has and has_i operator", () => {
    it("supports has operator", (done) => {
      const markup = `
        <esi:assign name="str" value="Sean@Banan!"/>
        <esi:choose>
          <esi:when test="$(str) has 'Banan'"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) has 'banan'"/>
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports has_i operator", (done) => {
      const markup = `
        <esi:assign name="str" value="Sean@Banan!"/>
        <esi:choose>
          <esi:when test="$(str) has_i 'banan'"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) has_i 'Apple'"/>
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });
  });

  describe("matches and matches_i operator", () => {
    it("supports matches operator", (done) => {
      const markup = `
        <esi:assign name="str" value="Sean@Banan!"/>
        <esi:choose>
          <esi:when test="$(str) matches 'B.nan'"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) matches 'b.Nan'"/>
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports matches_i operator", (done) => {
      const markup = `
        <esi:assign name="str" value="Sean@Banan!"/>
        <esi:choose>
          <esi:when test="$(str) matches_i 'b.Nan'"/>
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$(str) matches_i 'Apple'"/>
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>true</p>");
          done();
        }
      }, done);
    });

    it("supports matches operator with matchname property", (done) => {
      const markup = `
          <esi:choose>
          <esi:when test="'blahonga25blahingi' matches '''(blahonga)(\\d*)(5bla)'''" matchname="number">
            <p>$(number{0}) $(number{2})</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>blahonga25bla 2</p>");
          done();
        }
      }, done);
    });

    it("does not crash when matches is invoked on non-existing value", (done) => {
      const markup = `
          <esi:choose>
            <esi:when test="$(neh) matches '''(blahonga)(\\d*)(5bla)'''" matchname="damatch">
              <p>$(damatch{0}) $(number{2})</p>
            </esi:when>
          </esi:choose>
          <esi:vars>
          <p>$(damatch{0})$(number{2})</p>
          </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p></p>");
          done();
        }
      }, done);
    });

    it("does not crash when matches_i is invoked on non-existing value", (done) => {
      const markup = `
          <esi:choose>
            <esi:when test="$(neh) matches_i '''(blahonga)(\\d*)(5bla)'''" matchname="damatch">
              <p>$(damatch{0}) $(number{2})</p>
            </esi:when>
          </esi:choose>
          <esi:vars>
          <p>$(damatch{0})$(number{2})</p>
          </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p></p>");
          done();
        }
      }, done);
    });
  });

  describe("outputting variables", () => {
    it("outputs the value of variables in context of esi:vars", (done) => {
      const markup = `
        <esi:assign name="game1" value="Sim city"/>
        <p>$(game1)</p>
        <esi:vars>
          <p>Some $(game1) text</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>$(game1)</p><p>Some Sim city text</p>");
          done();
        }
      }, done);
    });
  });

  describe("reserved characters and escaping", () => {
    it("does not removes backslashes outside processing context", (done) => {
      const markup = `
        <p>\\Program Files\\Game\\Fun.exe.</p>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>\\Program Files\\Game\\Fun.exe.</p>");
          done();
        }
      }, done);
    });

    it("removes backslashes in processing context", (done) => {
      const markup = `
        <esi:vars>
          <p>\\Program Files\\Game\\Fun.exe.</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>Program FilesGameFun.exe.</p>");
          done();
        }
      }, done);
    });

    it("supports escaping backslashes with backslash in processing context", (done) => {
      const markup = `
        <esi:vars>
          <p>\\\\Program Files\\\\Game\\\\Fun.exe.</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>\\Program Files\\Game\\Fun.exe.</p>");
          done();
        }
      }, done);
    });

    it("does not support espacing backslashes in processing context with tripple quotes", (done) => {
      const markup = `
        <esi:vars>
          <p>'''\\Program Files\\Game\\Fun.exe.'''</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      localEsi(markup, { }, {
        send(body) {
          expect(body).to.equal("<p>'''Program FilesGameFun.exe.'''</p>");
          done();
        }
      }, done);
    });

    it("removes backslashes when assigning variables", (done) => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="\\/my\\stuff/" />
        <esi:include src="$(daurl)" dca="none"/>
        <esi:vars>
          <p>$(daurl)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      nock("http://localhost:1234")
        .get("/mystuff/")
        .reply(200, "<p>hej</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>/mystuff/</p>");
          done();
        }
      }, done);
    });

    it("supports escaping using backslash when assigning variables", (done) => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="\\\\/my\\\\stuff/" />
        <esi:include src="$(daurl)" dca="none"/>
        <esi:vars>
          <p>$(daurl)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      nock("http://my:80")
        .get("/stuff/")
        .reply(200, "<p>hej</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>\\/my\\stuff/</p>");
          done();
        }
      }, done);
    });

    it("supports escaping using tripple quotes when assigning variables", (done) => {
      // We test this using esi:include and nock as we want to ensure that it isn't simply as output time that the variables value is without backslashes
      const markup = `
        <esi:assign name="daurl" value="'''\\/my\\stuff/'''" />
        <esi:include src="$(daurl)" dca="none"/><p>efter</p>
      `.replace(/^\s+|\n/gm, "");

      nock("http://my:80")
        .get("/stuff/")
        .reply(200, "<p>hej</p>");

      localEsi(markup, {
        socket: {
          server: {
            address() {
              return {
                port: 1234
              };
            }
          }
        }
      }, {
        send(body) {
          expect(body).to.equal("<p>hej</p><p>efter</p>");
          done();
        }
      }, done);
    });
  });

  describe("esi:assign", () => {
    it("should evaluate value expression", (done) => {
      const markup = `
        <esi:assign name="cookie_val" value="$(HTTP_COOKIE{'cookie1'})" />
        <esi:vars>
          $(cookie_val)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "jklöjl";
      localEsi(markup, { cookies: { cookie1: "jklöjl" } }, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });

    it("should support assignment from regex result", (done) => {
      const markup = `
        <esi:choose>
          <esi:when test="'blahonga25blahingi' matches '''(blahonga)(\\d*)(5bla)'''" matchname="number_match">
            <esi:assign name="number" value="$(number_match{2})" />
          </esi:when>
        </esi:choose>
        <esi:vars>
          $(number)
        </esi:vars>
        `.replace(/^\s+|\n/gm, "");

      const expectedMarkup = "2";
      localEsi(markup, {}, {
        send(body) {
          expect(body).to.equal(expectedMarkup);
          done();
        }
      }, done);
    });
  });
});
