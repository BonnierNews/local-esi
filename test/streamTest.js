import path from "path";
import { fileURLToPath } from "url";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import HTMLParser from "@bonniernews/atlas-html-stream";

import { ESI } from "../index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("stream", () => {
  it("takes piped object stream", async () => {
    const options = { encoding: "utf-8" };
    const file = await open(path.join(__dirname, "/resources/esi.html"));
    const stream = Readable.toWeb(file.createReadStream(options));
    const chunks = [];
    const transformedStream = stream.pipeThrough(new HTMLParser({ preserveWS: true })).pipeThrough(new ESI());
    const reader = transformedStream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      chunks.push(value);
    }
    await file.close();

    expect(chunks).to.have.length(29);
  });

  it("can be piped", async () => {
    const options = { encoding: "utf-8" };
    const file = await open(path.join(__dirname, "/resources/esi.html"));
    const stream = Readable.toWeb(file.createReadStream(options));
    const chunks = [];

    const streams = [
      stream,
      new HTMLParser({ preserveWS: true }),
      new ESI({}),
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    ];
    await pipeline(streams);

    await file.close();
    expect(chunks).to.have.length(29);
  });

  it("stream can be closed if redirect instruction is used", async () => {
    const markup = [ (`
      <html><body>
      <esi:vars>
        $set_redirect('https://blahonga.com')
      </esi:vars>
      <p>Off</p>
    `) ]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    const esi = new ESI({});
    let redirect;
    esi.addEventListener("set_redirect", (event) => {
      redirect = event.detail;
    });

    await pipeline([
      ReadableStream.from(markup),
      new HTMLParser({ preserveWS: true }),
      esi,
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    ]);
    expect(redirect.statusCode).to.equal(302);
    expect(redirect.location).to.equal("https://blahonga.com");
  });

  it("set redirect instruction emits redirect 302 with location", async () => {
    const options = { encoding: "utf-8" };
    const file = await open(path.join(__dirname, "/resources/redirect.html"));
    const stream = Readable.toWeb(file.createReadStream(options));
    const transform = new ESI({});
    let redirect;
    transform.addEventListener("set_redirect", (event) => {
      redirect = event.detail;
      process.nextTick(() => transform.readable.cancel());
    });
    const chunks = [];
    await stream.pipeThrough(new HTMLParser({ preserveWS: true })).pipeThrough(transform).pipeTo(new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    }));
    expect(redirect.statusCode).to.equal(302);
    expect(redirect.location).to.equal("https://blahonga.com");
  });

  it("set response code instruction emits event with response code", async () => {
    const markup = [ (`
      <html>
      <head>
      <esi:vars>
        $set_response_code(200)
      </esi:vars>
      </head>
      <body>
    `) ]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p></div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const esi = new ESI({});
    let send;
    esi.addEventListener("set_response_code", (event) => {
      send = event.detail;
    });
    const chunks = [];
    await pipeline([
      ReadableStream.from(markup),
      new HTMLParser({ preserveWS: true }),
      esi,
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    ]);
    expect(send.statusCode).to.equal(200);
    expect(send.body).to.undefined;
    expect(chunks).to.have.length.above(4);
  });

  it("set response code with body emits event with code and body", async () => {
    const markup = [ (`
      <html><body>
      <esi:vars>
        $set_response_code(200, 'Great success')
      </esi:vars>
    `) ]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const esi = new ESI({});
    let send;
    esi.addEventListener("set_response_code", (event) => {
      send = event.detail;
    });
    const chunks = [];
    await pipeline([
      ReadableStream.from(markup),
      new HTMLParser({ preserveWS: true }),
      esi,
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    ]);
    expect(send.statusCode).to.equal(200);
    expect(send.withBody).to.equal("Great success");
  });

  it("set response code succeeded by add header emits events even if destroyed on first instruction", async () => {
    const markup = [ (`
      <html><body>
      <esi:vars>
        $set_response_code(302)
        $add_header('Location', 'https://example.com')
      </esi:vars>
    `) ]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");
    const esi = new ESI({});
    let send;
    esi.addEventListener("set_response_code", (event) => {
      send = event.detail;
      esi.readable.cancel();
    });
    esi.addEventListener("add_header", (event) => {
      const { name, value } = event.detail;
      send[name] = value;
    });
    const chunks = [];
    await pipeline([
      ReadableStream.from(markup),
      new HTMLParser({ preserveWS: true }),
      esi,
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    ]);
    expect(send.statusCode).to.equal(302);
    expect(send.body).to.undefined;
    expect(send).to.have.property("Location", "https://example.com");
  });

  it("set location header succeeded by set redirect response code emits both events", async () => {
    const markup = [ (`
      <html><body>
      <esi:vars>
        $add_header('Location', 'https://example.com')
        $set_response_code(302)
      </esi:vars>
    `) ]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const esi = new ESI({});
    let send;
    esi.addEventListener("set_response_code", (event) => {
      send.statusCode = event.detail.statusCode;
      send.withBody = event.detail.withBody;
      esi.readable.cancel();
    });
    esi.addEventListener("add_header", (event) => {
      const { name, value } = event.detail;
      send = { [name]: value };
    });
    const chunks = [];
    await pipeline([
      ReadableStream.from(markup),
      new HTMLParser({ preserveWS: true }),
      esi,
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    ]);
    expect(send.statusCode).to.equal(302);
    expect(send.withBody).to.undefined;
    expect(send).to.have.property("Location", "https://example.com");
  });

  it("closes stream if an esi parse error occur", async () => {
    const markup = [ (`
      <html><body>
      <esi:vars>
        $hittepa_funktion()
      </esi:vars>
    `) ]
      .concat(Array(1000).fill().map((_, idx) => `<div><p>${idx}</p><div>`), "</body></html>")
      .join("")
      .replace(/^\s+|\n/gm, "");

    const chunks = [];
    let err;
    try {
      await pipeline([
        ReadableStream.from(markup),
        new HTMLParser({ preserveWS: true }),
        new ESI({}),
        new WritableStream({
          write(chunk) {
            chunks.push(chunk);
          },
        }),
      ]);
    } catch (e) {
      err = e;
    }
    expect(err).to.be.ok.and.match(/is not implemented/i);
  });
});
