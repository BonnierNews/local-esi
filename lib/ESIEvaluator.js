"use strict";

const HtmlParser = require("@bonniernews/atlas-html-stream");
const request = require("got");
const url = require("url");
const {assign, test, replace} = require("./evaluateExpression");
const {convert, createESIParser} = require("./transformHtml");
const {chunkToMarkup} = require("./markup");
const {Readable} = require("stream");

module.exports = function ESIEvaluator(context) {
  const esiTags = {};

  esiTags["esi:except"] = {
    open(data, next) {
      context.inExcept = true;
      next();
    },
    close(next) {
      context.inExcept = false;
      next();
    }
  };

  esiTags["esi:choose"] = {
    open(data, next) {
      context.chooses.push({ hasEvaluatedToTrue: false, isCurrentlyEvaluatedTo: false });

      return next();
    },
    close(next) {
      context.chooses.pop();

      return next();
    }
  };

  esiTags["esi:assign"] = {
    open(data, next) {
      if (!shouldWrite()) {
        return next();
      }

      const value = data.value;
      try {
        context.assigns[data.name] = assign(value, context);
      } catch (err) {
        if (/unknown keyword/i.test(err.message)) context.assigns[data.name] = value;
        else return next(err);
      }

      next();
    }
  };

  esiTags["esi:vars"] = {
    open(data, next) {
      next();
    },
    close(next) {
      next();
    }
  };

  esiTags["esi:include"] = {
    open(data, next) {
      if (!shouldWrite()) return next();

      fetchIncluded(data, (fetchError, fetchResult) => {
        if (fetchError) {
          return next(fetchError);
        }
        const listener = ESIEvaluator(context.clone());

        const chunks = [];
        let pipeline = convert(fetchResult).pipe(new HtmlParser({ preserveWS: true }));
        if (data.dca === "esi") {
          pipeline = pipeline.pipe(createESIParser(listener));
        }
        pipeline.on("data", (chunk) => chunks.push(chunk))
          .on("finish", () => {
            writeToResult(chunks, next);
          })
          .on("error", next);
      });
    }
  };

  esiTags["esi:eval"] = {
    open(data, next) {
      if (!shouldWrite()) return next();
      fetchIncluded(data, (fetchError, fetchResult) => {
        if (fetchError) {
          return next(fetchError);
        }

        const listener = ESIEvaluator(context.clone(true));
        const chunks = [];
        convert(fetchResult)
          .pipe(new HtmlParser({ preserveWS: true }))
          .pipe(createESIParser(listener))
          .on("data", (chunk) => chunks.push(chunk))
          .on("finish", () => {
            writeToResult(chunks, next);
          })
          .on("error", next);
      });
    }
  };

  esiTags["esi:try"] = {
    open(data, next) {
      next();
    }
  };

  esiTags["esi:text"] = {
    plainText: true,
    open(data, next) {
      next();
    },
    close(next) {
      next();
    }
  };

  esiTags["esi:attempt"] = {
    open(data, next) {
      context.inAttempt = true;
      next();
    }
  };

  esiTags["esi:when"] = {
    open(data, next) {
      const lastChoose = context.chooses[context.chooses.length - 1];
      const result = test(data.test, context);
      if (data.matchname) {
        context.assigns[data.matchname] = result;
      }

      lastChoose.isCurrentlyEvaluatedTo = !lastChoose.isCurrentlyEvaluatedTo && result;
      lastChoose.hasEvaluatedToTrue = lastChoose.hasEvaluatedToTrue || result;

      return next();
    },
    close(next) {
      next();
    }
  };

  esiTags["esi:otherwise"] = {
    open(data, next) {
      const lastChoose = context.chooses[context.chooses.length - 1];
      lastChoose.isCurrentlyEvaluatedTo = !lastChoose.hasEvaluatedToTrue;
      return next();
    },
    close(next) {
      next();
    }
  };

  esiTags["esi:foreach"] = {
    open(data, next) {
      context.items = assign(data.collection, context);
      if (!Array.isArray(context.items)) {
        context.items = Object.entries(context.items);
      }

      context.foreachChunks = [];
      return next();
    },
    close(next) {
      const foreachChunks = context.foreachChunks;
      delete context.foreachChunks;

      let buffered = [];

      context.items.forEach((value) => {
        if (Array.isArray(value)) value = `[${value.map((v) => typeof v === "string" ? `'${v}'` : v).join(",")}]`;
        buffered = buffered.concat([{
          name: "esi:assign", data: {name: "item", value: value.toString()}
        }, {name: "esi:assign"}], foreachChunks);
      });

      const localContext = context.subContext();
      localContext.inForeach = true;
      const listener = ESIEvaluator(localContext);
      const chunks = [];
      createChunkStream(buffered)
        .pipe(createESIParser(listener))
        .on("data", function onData(chunk) {
          if (chunk.name === "esi:break") {
            this.pause();
            return process.nextTick(() => this.destroy());
          }

          chunks.push(chunk);
        })
        .on("finish", complete)
        .on("error", next);

      function complete() {
        writeToResult(chunks, next);
      }
    }
  };

  esiTags["esi:break"] = {
    open(data, next) {
      if (!context.inForeach) return next(new Error("esi:break outside esi:foreach"));
      context.breakHit = context.breakHit || shouldWrite();
      return context.breakHit ? next(null, {name: "esi:break"}) : next();
    }
  };

  async function fetchIncluded(data, fetchCallback) {
    const options = {
      throwHttpErrors: false,
      retry: 0,
      headers: Object.assign({}, context.req.headers)
    };

    options.headers.host = undefined;
    delete options.headers["content-type"];

    let includeUrl = replace(data.src, context);
    if (!includeUrl.startsWith("http")) {
      includeUrl = url.resolve(`http://localhost:${context.req.socket.server.address().port}`, includeUrl);
    }

    try {
      const response = await request.get(includeUrl, options);
      if (response.statusCode > 399) {
        throw new Error(`Response code: ${response.statusCode}`);
      }
      return fetchCallback(null, response.body);
    } catch (err) {
      if (context.inAttempt) {
        context.lastAttemptWasError = true;
        return fetchCallback(null, "");
      }
      return fetchCallback(err);
    }
  }

  return {
    onopentag,
    ontext,
    onclosetag,
  };

  function onopentag(name, data, next) {
    if (context.foreachChunks) {
      context.foreachChunks.push({name, data});
      return next();
    }

    if (name.startsWith("esi:")) {
      const esiFunc = esiTags[name];
      const wasInPlainText = context.isInPlainText();
      if (!esiFunc && !wasInPlainText) {
        throw new Error(`ESI tag ${name} not implemented.`);
      }

      context.tags.push(esiFunc);
      if (!wasInPlainText) return esiFunc.open(data, next);
    }

    writeToResult({name, data: makeAttributes(data)}, next);
  }

  function onclosetag(name, next) {
    if (name !== "esi:foreach" && context.foreachChunks) {
      context.foreachChunks.push({name});
      return next();
    }

    if (name.startsWith("esi:")) {
      const popped = context.tags.pop();

      if (!context.isInPlainText()) {
        if (popped && popped.close) return popped.close(next);
        return next();
      }
    }

    writeToResult({name}, next);
  }

  function ontext(text, next) {
    if (context.foreachChunks) {
      context.foreachChunks.push({text});
      return next();
    }

    if (!context.isProcessing()) {
      return writeToResult({text}, next);
    }

    const current = context.tags[context.tags.length - 1];
    if (context.bufferingString && current.text) {
      text = current.text + text;
    }

    try {
      return writeToResult((currentContext) => {
        const result = {text: replace(text, currentContext || context)};
        context.bufferingString = false;
        return result;
      }, next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.bufferingString = true;
        current.text = text;
        return next();
      }

      return next(err);
    }
  }

  function makeAttributes(data) {
    if (!data) return {};

    return Object.keys(data).reduce((attributes, key) => {
      let value = data[key];
      if (context.isProcessing()) {
        value = replace(value, context);
      }
      attributes[key] = value || "";
      return attributes;
    }, {});
  }

  function writeToResult(chunk, next) {
    if (context.bufferingString) {
      const [current = {}] = context.tags.slice(-1);
      if (typeof chunk === "function") {
        chunk = chunk();
      }

      current.text += chunkToMarkup(chunk);

      return next();
    }

    if (shouldWrite()) {
      if (typeof chunk === "function") {
        chunk = chunk();
      }
      return next(null, chunk);
    }

    next();
  }

  function shouldWrite() {
    if (context.inExcept && !context.lastAttemptWasError) return false;
    if (context.breakHit) return false;

    if (context.chooses.length) {
      return context.chooses.every((choose) => choose.isCurrentlyEvaluatedTo);
    }

    return true;
  }
};

function createChunkStream(chunks) {
  const reader = new Readable({objectMode: true});

  reader._read = function () {
    if (!chunks.length) return reader.push(null);
    while (reader.push(chunks.shift())) {
      if (!chunks.length) {
        reader.push(null);
        break;
      }
    }
  };

  return reader;
}
