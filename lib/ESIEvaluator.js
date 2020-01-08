"use strict";

const HtmlParser = require("atlas-html-stream");
const ListenerContext = require("./ListenerContext");
const request = require("request");
const url = require("url");
const {assign, test, replace} = require("./evaluateExpression");
const {convert, createESIParser} = require("./transformHtml");
const {chunkToMarkup, opentag: toOpenTag, closetag: toCloseTag, voidElements, selfClosingElements} = require("./markup");
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
      context.inEsiStatementProcessingContext = true;
      next();
    },
    close(next) {
      context.inEsiStatementProcessingContext = false;
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
        const listener = ESIEvaluator(ListenerContext(context.req, context.res, context.emitter));

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
        const wasInProcessingContext = context.inEsiStatementProcessingContext;
        context.inEsiStatementProcessingContext = false;
        const listener = ESIEvaluator(context);
        const chunks = [];
        convert(fetchResult)
          .pipe(new HtmlParser({ preserveWS: true }))
          .pipe(createESIParser(listener))
          .on("data", (chunk) => chunks.push(chunk))
          .on("finish", () => {
            context.inEsiStatementProcessingContext = wasInProcessingContext;
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
      context.inEsiStatementProcessingContext = true;

      return next();
    },
    close(next) {
      context.inEsiStatementProcessingContext = false;
      next();
    }
  };

  esiTags["esi:otherwise"] = {
    open(data, next) {
      const lastChoose = context.chooses[context.chooses.length - 1];
      lastChoose.isCurrentlyEvaluatedTo = !lastChoose.hasEvaluatedToTrue;

      context.inEsiStatementProcessingContext = true;
      return next();
    },
    close(next) {
      context.inEsiStatementProcessingContext = false;
      next();
    }
  };

  esiTags["esi:foreach"] = {
    open(data, next) {
      context.items = assign(data.collection, context);
      if (!Array.isArray(context.items)) {
        context.items = Object.entries(context.items);
      }

      // context.inEsiStatementProcessingContext = true;
      context.itemChunks = [];
      return next();
    },
    async close(next) {
      context.inEsiStatementProcessingContext = true;

      const itemChunks = context.itemChunks;
      delete context.itemChunks;

      let buffered = [];

      context.items.forEach((value) => {
        if (Array.isArray(value)) value = `[${value.map((v) => typeof v === "string" ? `'${v}'` : v).join(",")}]`;
        buffered = buffered.concat([{
          name: "esi:assign", data: {name: "item", value: value.toString()}
        }, {name: "esi:assign"}], itemChunks);
      });

      const listener = ESIEvaluator(context);
      const chunks = [];
      createChunkStream(buffered)
        .pipe(createESIParser(listener))
        .on("data", (chunk) => {
          chunks.push(chunk);
        })
        .on("finish", () => {
          context.inEsiStatementProcessingContext = false;
          writeToResult(chunks, next);
        })
        .on("error", next);
    }
  };

  function fetchIncluded(data, fetchCallback) {
    const options = {
      headers: Object.assign({}, context.req.headers)
    };

    options.headers.host = undefined;
    delete options.headers["content-type"];

    let includeUrl = replace(data.src, context);
    if (!includeUrl.startsWith("http")) {
      includeUrl = url.resolve(`http://localhost:${context.req.socket.server.address().port}`, includeUrl);
    }

    request.get(includeUrl, options, (err, res, body) => {
      if (!err && res.statusCode > 399) {
        err = new Error(`Response code: ${res.statusCode}`);
      }
      if (err) {
        if (context.inAttempt) {
          context.lastAttemptWasError = true;
          return fetchCallback(null, "");
        }
        return fetchCallback(err);
      }
      fetchCallback(null, body);
    });
  }

  return {
    onopentag,
    ontext,
    onclosetag,
  };

  function onopentag(name, data, next) {
    if (context.itemChunks) {
      context.itemChunks.push({name, data});
      return next();
    }

    const [current = {}] = context.tags.slice(-1);
    if (current.plainText && current.callExpression) {
      current.text += toOpenTag(name, data);
      return next();
    }

    if (name.startsWith("esi:")) {
      if (!current.plainText) {
        const esiFunc = esiTags[name];
        context.tags.push(esiFunc);

        if (!esiFunc) {
          throw new Error(`ESI tag ${name} not implemented.`);
        }
        const res = esiFunc.open(data, next);
        return res;
      }

      if (selfClosingElements.includes(name)) {
        return writeToResult({name, data: makeAttributes(data)}, next);
      }
    }

    if (name === "!--") {
      return writeToResult({name, data: makeAttributes(data)}, next);
    }
    writeToResult({name, data: makeAttributes(data)}, next);
  }

  function ontext(text, next) {
    if (context.itemChunks) {
      context.itemChunks.push({text});
      return next();
    }

    const [current = {}] = context.tags.slice(-1);
    if (!context.inEsiStatementProcessingContext) {
      return writeToResult({text}, next);
    }

    if (current.plainText) {
      return writeToResult({text}, next);
    }

    if (context.buffering && current.text) {
      text = current.text + text;
    }

    try {
      return writeToResult((currentContext) => {
        const result = {text: replace(text, currentContext || context)};
        context.buffering = false;
        return result;
      }, next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.buffering = true;
        current.text = text;
        return next();
      }

      return next(err);
    }
  }

  function onclosetag(name, next) {
    if (name !== "esi:foreach" && context.itemChunks) {
      context.itemChunks.push({name});
      return next();
    }

    const [current = {}] = context.tags.slice(-1);

    if (current.plainText && current.callExpression) {
      current.text += toCloseTag(name);
      return next();
    }

    if (name.startsWith("esi:")) {
      if (!current.plainText) {
        const esiFunc = esiTags[name];
        if (!esiFunc) {
          throw new Error(`ESI tag ${name} not implemented.`);
        }

        if (esiFunc.close) {
          return esiFunc.close(next);
        }

        return next();
      } else if (current.plainText && esiTags[name] === current) {
        context.tags.pop();
        if (current.close) {
          return current.close(next);
        }
        return next();
      }

      if (selfClosingElements.includes(name)) {
        return next();
      }
    }

    if (voidElements.includes(name)) return next();

    writeToResult({name}, next);
  }

  function makeAttributes(data) {
    if (!data) return {};

    return Object.keys(data).reduce((attributes, key) => {
      let value = data[key];
      const [current = {}] = context.tags.slice(-1);
      if (context.inEsiStatementProcessingContext && !current.plainText) {
        value = replace(value, context);
      }
      attributes[key] = value;
      return attributes;
    }, {});
  }

  function writeToResult(chunk, next) {
    if (context.buffering) {
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
    if (context.inExcept && !context.lastAttemptWasError) {
      return false;
    }

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
