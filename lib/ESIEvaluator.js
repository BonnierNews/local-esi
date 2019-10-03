"use strict";

const esiExpressionParser = require("./esiExpressionParser");
const evaluateExpression = require("./evaluateExpression");
const HtmlParser = require("atlas-html-stream");
const ListenerContext = require("./ListenerContext");
const request = require("request");
const url = require("url");
const {convert, createESIParser} = require("./transformHtml");
const {opentag: toOpenTag, closetag: toCloseTag, voidElements, selfClosingElements} = require("./markup");

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
      if (value.startsWith("'''") && value.endsWith("'''")) {
        context.assigns[data.name] = value.replace(/'''/ig, "");
      } else {
        context.assigns[data.name] = removeReservedCharacters(evaluateExpression(value, context));
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
      const result = evaluateExpression(data.test, context);
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

  function fetchIncluded(data, fetchCallback) {
    const options = {
      headers: Object.assign({}, context.req.headers)
    };

    options.headers.host = undefined;
    delete options.headers["content-type"];

    let source = data.src;

    if (source.indexOf("$(") > -1 && source.indexOf(")") > -1) {
      source = handleProcessingInstructions(source);
    }

    for (const key in context.assigns) {
      if (typeof context.assigns[key] === "string") {
        source = source.replace(`$(${key})`, context.assigns[key]);
      }
    }

    source = source.replace(/\$url_encode\((.*?)\)/, (_, b) => {
      return encodeURIComponent(b);
    });

    let includeUrl = source;
    if (!includeUrl.startsWith("http")) {
      includeUrl = url.resolve(`http://localhost:${context.req.socket.server.address().port}`, source);
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

  function shouldWrite() {
    if (context.inExcept && !context.lastAttemptWasError) {
      return false;
    }

    if (context.chooses.length) {
      return context.chooses.every((choose) => choose.isCurrentlyEvaluatedTo);
    }

    return true;
  }

  function onopentag(name, data, next) {
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
    const [current = {}] = context.tags.slice(-1);

    if (!context.inEsiStatementProcessingContext) {
      return writeToResult({text}, next);
    }

    if (/^\$\w+\(/.test(text)) {
      const expression = esiExpressionParser(text);
      if (expression.type !== "CallExpression" && !current.plainText) {
        context.tags.push({
          text: text,
          plainText: true,
          callExpression: true,
        });
        return next();
      }

      try {
        return writeToResult(() => {
          return {text: handleProcessingInstructions(ensureNoIllegalCharacters(text))};
        }, next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
      } catch (err) {
        return next(err);
      }
    }

    if (current.callExpression) {
      const testText = current.text + text;
      const expression = esiExpressionParser(testText);

      if (expression.type !== "CallExpression") {
        current.text = testText;
        return next();
      }

      context.tags.pop();

      try {
        return writeToResult(() => {
          return {text: handleProcessingInstructions(ensureNoIllegalCharacters(testText))};
        }, next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
      } catch (err) {
        return next(err);
      }
    }

    if (!current.plainText) {
      try {
        return writeToResult(() => {
          return {text: handleProcessingInstructions(ensureNoIllegalCharacters(text))};
        }, next); //handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
      } catch (err) {
        return next(err);
      }
    }

    try {
      return writeToResult({text}, next);
    } catch (err) {
      return next(err);
    }
  }

  function onclosetag(name, next) {
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

  function ensureNoIllegalCharacters(text) {
    // matches
    // - dollar signs not part of an esi expression
    const pattern = /(\$(?!\w*?\())/g;
    let match;

    while ((match = pattern.exec(text))) {
      const {"1": character, index} = match;
      if (text.charAt(index - 1) === "\\") continue;

      const excerptStart = Math.max(index - 30, 0);
      const excerpt = text.substr(excerptStart, 60);

      throw new Error(`Illegal character "${character}" in "${excerpt}"`);
    }

    return text;
  }

  function handleProcessingInstructions(text) {
    text = removeReservedCharacters(text);

    let newText = "";
    let inExpression = false;
    let expressionStart;
    let openParentheses = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === "$") {
        if (!inExpression) {
          expressionStart = i;
        }
        inExpression = true;
      }

      if (!inExpression) {
        newText += char;
      }


      if (inExpression && char === "(") {
        openParentheses++;
      }

      if (inExpression && char === ")") {
        openParentheses--;
        if (openParentheses === 0) {
          inExpression = false;
          const expressionResult = evaluateExpression(text.substring(expressionStart, i + 1), context);
          if (expressionResult !== undefined) {
            newText += expressionResult;
          }
        }
      }
    }

    return newText;
  }

  function removeReservedCharacters(original) {
    if (!original || typeof original !== "string") {
      return original;
    }

    let text = original.replace(/\\["]/g, "\"");

    text = text.replace(/(^|[^\\])(\\)($|[^\\])/ig, (_, group1, _2, group3) => { //Remove backslashes, but not escaped ones
      return `${group1}${group3}`;
    });

    text = text.replace(/\\\\/g, "\\"); //Escaped backslashes, remove the escaping backslash

    return text;
  }

  function makeAttributes(data) {
    if (!data) return {};

    return Object.keys(data).reduce((attributes, key) => {
      let value = data[key];
      const [current = {}] = context.tags.slice(-1);
      if (context.inEsiStatementProcessingContext && !current.plainText) {
        value = handleProcessingInstructions(value);
      }
      attributes[key] = value;
      return attributes;
    }, {});
  }

  function writeToResult(chunk, next) {
    if (typeof chunk === "function" && (context.inReplacement || shouldWrite())) {
      chunk = chunk();
    }

    if (context.inReplacement) {
      context.replacement += chunk;
      return next();
    }
    if (shouldWrite()) {
      return next(null, chunk);
    }
    next();
  }
};
