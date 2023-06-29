import * as ck from "chronokinesis";

import { parse } from "../index.js";

describe("functions", () => {
  describe("$add_header", () => {
    it("should set headers when instructed", async () => {
      let markup = "<esi:vars>";
      markup += "$add_header('Set-Cookie', 'MyCookie1=SomeValue; HttpOnly')";
      markup += "</esi:vars>";

      const { body, headers } = await parse(markup);
      expect(body).to.equal("");
      expect(headers).to.have.property("set-cookie").that.deep.equal([ "MyCookie1=SomeValue; HttpOnly" ]);
    });

    it("should set multiple headers when instructed", async () => {
      let markup = "<esi:vars>";
      markup += "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";
      markup += "$add_header('Set-Cookie', 'MyCookie2=SomeValue2; Path=/; Secure; SameSite=Lax')";
      markup += "</esi:vars>";

      const { body, headers } = await parse(markup);
      expect(body).to.equal("");
      expect(headers).to.have.property("set-cookie").that.deep.equal([
        "MyCookie1=SomeValue;",
        "MyCookie2=SomeValue2; Path=/; Secure; SameSite=Lax",
      ]);
    });

    it("should NOT set headers when instructed outside an ESI tag", async () => {
      const markup = "$add_header('Set-Cookie', 'MyCookie1=SomeValue;')";

      const { body, headers } = await parse(markup);
      expect(body).to.equal(markup);
      expect(headers).to.be.undefined;
    });

    it("should set headers when instructed in esi:choose", async () => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
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

      const { body, headers } = await parse(markup);
      expect(body).to.equal("");
      expect(headers).to.have.property("set-cookie").that.deep.equal([
        "MyCookie1=SomeValue;",
        "MyCookie2=SomeValue2;",
      ]);
    });

    it("should not set headers when in esi:choose clause that doesn't match", async () => {
      const markup = `
        <esi:assign name="authorized" value="'false'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            $add_header('Set-Cookie', 'MyCookie1=SomeValue;')
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body, headers } = await parse(markup);
      expect(body).to.equal("");
      expect(headers).to.be.undefined;
    });
  });

  describe("$set_response_code", () => {
    it("supports $set_response_code with status as only parameter", async () => {
      const markup = `
        <esi:vars>
          $set_response_code( 401 )
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(body).to.equal("");
      expect(statusCode).to.equal(401);
    });

    it("supports $set_response_code with status and replacement markup", async () => {
      const markup = `
        <esi:vars>
          $set_response_code(400, '<p>hej</p>')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.equal(400);
      expect(body).to.equal("<p>hej</p>");
    });

    it("supports $set_response_code with status and replacement markup in esi:choose", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="'a' == 'b'">
            <p>ignore</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(400, '<p>hej</p>')
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.equal(400);
      expect(body).to.equal("<p>hej</p>");
    });

    it("supports $set_response_code with status and replacement markup containing what looks like the end of the statement", async () => {
      const markup = `
        <esi:vars>
          $set_response_code(400, '<p>)</p>')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.equal(400);
      expect(body).to.equal("<p>)</p>");
    });

    it("supports $set_response_code with status and replacement string", async () => {
      const markup = `
        <esi:vars>
          $set_response_code(400, 'OK')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.equal(400);
      expect(body).to.equal("OK");
    });

    it("supports $set_response_code in esi:choose", async () => {
      const markup = `
        <esi:assign name="authorized" value="'false'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401, '<p>Unauthorized</p>')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.equal(401);
      expect(body).to.equal("<p>Unauthorized</p>");
    });

    it("should not set response code in esi:choose clause that doesn't match", async () => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401)
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.be.undefined;
      expect(body).to.equal("<p>Content for you</p>");
    });

    it("should not set response code or modify body when in esi:choose clause that doesn't match", async () => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_response_code(401, '<p>Unauthorized</p>')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body, statusCode } = await parse(markup);
      expect(statusCode).to.be.undefined;
      expect(body).to.equal("<p>Content for you</p>");
    });
  });

  describe("$set_redirect", () => {
    it("supports $set_redirect", async () => {
      const markup = `
        <esi:vars>
          $set_redirect('https://blahonga.com')
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { statusCode, headers } = await parse(markup);
      expect(statusCode).to.equal(302);
      expect(headers).to.have.property("location", "https://blahonga.com");
    });

    it("supports $set_redirect in esi:choose", async () => {
      const markup = `
        <esi:assign name="authorized" value="'false'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_redirect('https://blahonga.com')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { statusCode, headers } = await parse(markup);
      expect(statusCode).to.equal(302);
      expect(headers).to.have.property("location", "https://blahonga.com");
    });

    it("should not set redirect in esi:choose clause that doesn't match", async () => {
      const markup = `
        <esi:assign name="authorized" value="'true'"/>
        <esi:choose>
          <esi:when test="$(authorized)=='true'">
            <p>Content for you</p>
          </esi:when>
          <esi:otherwise>
            $set_redirect('https://blahonga.com')
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body, headers, statusCode } = await parse(markup);
      expect(body).to.equal("<p>Content for you</p>");
      expect(headers).to.be.undefined;
      expect(statusCode).to.be.undefined;
    });
  });

  describe("$base64", () => {
    it("supports $base64_encode", async () => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$base64_encode($(str)) == 'U2VhbkBCYW5hbiE='">
            <p>true</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>true</p>");
    });

    it("supports $base64_decode", async () => {
      const markup = `
        <esi:assign name="str" value="'U2VhbkBCYW5hbiE='"/>
        <esi:choose>
          <esi:when test="$base64_decode($(str)) == 'Sean@Banan!'">
            <p>true</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>true</p>");
    });

    it("handles base64_decode with undefined value", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$base64_decode($(str)) == 'Sean@Banan!'">
            <p>true</p>
          </esi:when>
          <esi:otherwise>
            <p>false</p>
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>false</p>");
    });

    it("handles base64_encode with undefined value", async () => {
      const markup = `
        <esi:choose>
          <esi:when test="$base64_encode($(str)) == 'Sean@Banan!'">
            <p>true</p>
          </esi:when>
          <esi:otherwise>
            <p>false</p>
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>false</p>");
    });
  });

  describe("$html", () => {
    it("supports $html_decode", async () => {
      const markup = "<esi:vars>$html_decode('&lt;script&gt;&lt;/script&gt;')</esi:vars>";

      const { body } = await parse(markup);
      expect(body).to.equal("<script></script>");
    });

    it("$html_decode supports identifier", async () => {
      const markup = "<esi:assign name='html' value=\"'&lt;script&gt;&lt;/script&gt;'\"/><esi:vars>$html_decode($(html))</esi:vars>";

      const { body } = await parse(markup);
      expect(body).to.equal("<script></script>");
    });
  });

  describe("$index", () => {
    it("supports $index", async () => {
      const markup = `
        <esi:assign name="str" value="'Sean@Banan!'"/>
        <esi:choose>
          <esi:when test="$index($(str), 'Banan') > -1">
            <p>true</p>
          </esi:when>
        </esi:choose>
        <esi:choose>
          <esi:when test="$index($(str), 'Apple') < 0">
            <p>true again</p>
          </esi:when>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>true</p><p>true again</p>");
    });
  });

  describe("$str", () => {
    it("supports $str", async () => {
      const markup = `
        <esi:assign name="int" value="1" />
        <esi:assign name="additionWithStr" value="$str($(int)) + $str($(int))" />
        <esi:assign name="additionWithoutStr" value="$(int) + $(int)" />
        Result: <esi:vars>$(additionWithStr)</esi:vars>,
        Same with $str():
        <esi:choose>
          <esi:when test="$(additionWithStr)==$(additionWithoutStr)">
            yes
          </esi:when>
          <esi:otherwise>
            no
          </esi:otherwise>
        </esi:choose>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("Result: 11,Same with $str():no");
    });

    it("outputs string representations of values with different types", async () => {
      const markup = `
        <esi:assign name="bool" value="false" />
        <esi:assign name="int" value="0" />
        <esi:vars>
          <ul>
            <li>$str($(bool))
            <li>$str($(int))
          </ul>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("" +
        "<ul>" +
          "<li>false" +
          "<li>0" +
        "</ul>"
      );
    });

    it("outputs None when $str is invoked with non-existing variable", async () => {
      const markup = `
        <esi:vars>
          $str($(noexist))
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("None");
    });

    it.skip("outputs string representations of objects", async () => {
      const markup = `
        <esi:assign name="list" value="[1, 2]" />
        <esi:assign name="obj" value="{'a': 1, 'b': 2}" />
        <esi:vars>
          <ul>
            <li>$str($(list))
            <li>$str($(obj))
          </ul>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("" +
        "<ul>" +
          "<li>[1, 2]" +
          "<li>{'a': 1, 'b': 2}" +
        "</ul>"
      );
    });
  });

  describe("$substr", () => {
    it("supports $substr", async () => {
      const markup = `
        <esi:assign name="str" value="'abcdef'" />
        <esi:vars>
          <p>$substr('12345678', 2, 4)</p>
          <p>$substr('12345678', 0)</p>
          <p>$substr('12345678', 1)</p>
          <p>$substr('12345678', -2)</p>
          <p>$substr('12345678', 2, 40)</p>
          <p>$substr('12345678', 2, -4)</p>
          <p>$substr($(str), 2, 2)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>3456</p><p>12345678</p><p>2345678</p><p>78</p><p>345678</p><p>34</p><p>cd</p>");
    });

    it("throws when $substr is invoked with non-existing variable", async () => {
      const markup = `
        <esi:vars>
          <p>$substr($(str), 2, 2)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const err = await parse(markup).catch((e) => e);
      expect(err).to.match(/substr invoked on non-string/);
    });

    it("throws when $substr is invoked without valid params", async () => {
      const markup = `
        <esi:vars>
          <p>$substr($(str))</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const err = await parse(markup).catch((e) => e);
      expect(err).to.match(/substr invoked on non-string/);
    });
  });

  describe("$time", () => {
    before(() => {
      ck.freeze("2019-06-30");
    });

    after(ck.reset);

    it("supports $time", async () => {
      const markup = `
        <esi:assign name="now" value="$time()" />
        <esi:vars>
          <p>$(now)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const now = Math.round(Date.now() / 1000);
      const { body } = await parse(markup);
      expect(body).to.equal(`<p>${now}</p>`);
    });
  });

  describe("$http_time", () => {
    it("supports $http_time", async () => {
      const markup = `
        <esi:assign name="now" value="$http_time(995319416)" />
        <esi:vars>
          <p>$(now)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup);
      expect(body).to.equal("<p>Mon, 16 Jul 2001 21:36:56 GMT</p>");
    });
  });

  describe("$digest_md5", () => {
    it("creates md5 hash", async () => {
      const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36";
      const remoteAddress = "83.185.38.31";

      const markup = `
        <esi:assign name="hash" value="$digest_md5($(REMOTE_ADDR) + $(HTTP_USER_AGENT))" />
        <esi:vars>
          <p>$(hash)</p>
        </esi:vars>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {
        headers: {
          "user-agent": userAgent,
          "x-forwarded-for": remoteAddress,
        },
      });

      expect(body).to.equal("<p>[657885894, 693072170, -1514255750, 111706645]</p>");
    });
  });

  describe("supports $string_split", () => {
    it("can split a string by a single character as a separator", async () => {
      const markup = `
      <esi:assign name="someString" value="one,two,three"/>
      <esi:foreach collection="$string_split($(someString), ',')">
        <p>$(item)</p>
      </esi:foreach>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal("<p>one</p><p>two</p><p>three</p>");
    });

    it("can split a string by multiple characters as a separator", async () => {
      const markup = `
      <esi:assign name="somesString" value="one...two...three"/>
      <esi:foreach collection="$string_split($(somesString), '...')">
        <p>$(item)</p>
      </esi:foreach>
      `.replace(/^\s+|\n/gm, "");

      const { body } = await parse(markup, {});
      expect(body).to.equal("<p>one</p><p>two</p><p>three</p>");
    });
  });
});
