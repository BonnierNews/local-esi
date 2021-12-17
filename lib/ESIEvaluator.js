/* eslint-disable no-use-before-define */
"use strict";

const { assign, test, replace } = require("./evaluateExpression");
const { pipeline, Readable } = require("stream");
const ESIBase = require("./ESIBase");
const HTMLStream = require("@bonniernews/atlas-html-stream");

class ESITag {
  constructor(context) {
    this.context = context;
  }
  open(data, next) {
    next();
  }
  close(next) {
    next();
  }
}

class ESIAttempt extends ESITag {
  open(data, next) {
    this.context.inAttempt = true;
    next();
  }
}

class ESIExcept extends ESITag {
  open(data, next) {
    this.context.inExcept = true;
    next();
  }
  close(next) {
    this.context.inExcept = false;
    next();
  }
}

class ESIChoose extends ESITag {
  open(data, next) {
    this.context.chooses.push({ testMatched: false, chosen: false });
    return next();
  }
  close(next) {
    this.context.chooses.pop();
    return next();
  }
}

class ESIWhen extends ESITag {
  open(data, next) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];

    let result;
    try {
      result = test(data.test, context);
    } catch (err) {
      return next(err);
    }

    if (lastChoose.testMatched) {
      lastChoose.chosen = false;
      return next();
    }

    if (data.matchname) {
      context.assigns[data.matchname] = result;
    }

    lastChoose.testMatched = lastChoose.chosen = !!result;

    return next();
  }
}

class ESIOtherwise extends ESITag {
  open(data, next) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];
    lastChoose.chosen = !lastChoose.testMatched;
    return next();
  }
}

class ESIText extends ESITag {
  get plainText() {
    return true;
  }
}

class ESIAssign extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) {
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
}

class ESIBreak extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.inForeach) return next(new Error("esi:break outside esi:foreach"));
    context.breakHit = context.breakHit || context.shouldWrite();
    return context.breakHit ? next(null, { name: "esi:break" }) : next();
  }
}

class ESIEval extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) return next();

    const chunks = [];
    pipeline([
      context.fetch(data),
      new HTMLStream({ preserveWS: true }),
      new ESIBase(new ESIEvaluator(context.clone(true))),
    ], (err) => {
      if (err) {
        if (err.inAttempt) return next();
        return next(err);
      }
      return context.writeToResult(chunks, next);
    }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIInclude extends ESITag {
  open(data, next) {
    const context = this.context;
    if (!context.shouldWrite()) return next();

    const chunks = [];
    const streams = [
      context.fetch(data),
      new HTMLStream({ preserveWS: true }),
    ];
    if (data.dca === "esi") {
      streams.push(new ESIBase(new ESIEvaluator(context.clone())));
    }
    pipeline(streams, (err) => {
      if (err) {
        if (err.inAttempt) return next();
        return next(err);
      }
      return context.writeToResult(chunks, next);
    }).on("data", (chunk) => chunks.push(chunk));
  }
}

class ESIForEach extends ESITag {
  open(data, next) {
    const context = this.context;
    context.items = assign(data.collection, context);
    if (!Array.isArray(context.items)) {
      context.items = Object.entries(context.items);
    }

    context.foreachChunks = [];
    return next();
  }
  close(next) {
    const context = this.context;
    const foreachChunks = context.foreachChunks;
    delete context.foreachChunks;

    let buffered = [];

    context.items.forEach((value) => {
      if (Array.isArray(value)) value = `[${value.map((v) => typeof v === "string" ? `'${v}'` : v).join(",")}]`;
      buffered = buffered.concat([ {
        name: "esi:assign", data: { name: "item", value: value.toString() },
      }, { name: "esi:assign" } ], foreachChunks);
    });

    const localContext = context.subContext();
    localContext.inForeach = true;
    const chunks = [];

    pipeline([
      Readable.from(buffered),
      new ESIBase(new ESIEvaluator(localContext)),
    ], (err) => {
      if (err) return next(err);
      return context.writeToResult(chunks, next);
    }).on("data", function onData(chunk) {
      if (chunk.name === "esi:break") {
        this.pause();
        return process.nextTick(() => this.push(null));
      }

      chunks.push(chunk);
    });
  }
}

const EsiTags = {
  "esi:assign": ESIAssign,
  "esi:attempt": ESIAttempt,
  "esi:break": ESIBreak,
  "esi:choose": ESIChoose,
  "esi:except": ESIExcept,
  "esi:otherwise": ESIOtherwise,
  "esi:text": ESIText,
  "esi:try": ESITag,
  "esi:vars": ESITag,
  "esi:when": ESIWhen,
  "esi:eval": ESIEval,
  "esi:include": ESIInclude,
  "esi:foreach": ESIForEach,
};

class ESIEvaluator {
  constructor(context) {
    this.context = context;
  }
  onopentag(name, data, next) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ name, data });
      return next();
    }

    if (name.startsWith("esi:")) {
      const Tag = EsiTags[name];
      const wasInPlainText = context.isInPlainText();
      if (!Tag && !wasInPlainText) {
        throw new Error(`ESI tag ${name} not implemented.`);
      }
      let esiFunc;
      if (Tag) esiFunc = new Tag(context);
      context.tags.push(esiFunc);
      if (!wasInPlainText) return esiFunc.open(data, next);
    }

    context.writeToResult({ name, data: this.makeAttributes(data) }, next);
  }
  onclosetag(name, next) {
    const context = this.context;
    if (name !== "esi:foreach" && context.foreachChunks) {
      context.foreachChunks.push({ name });
      return next();
    }

    if (name.startsWith("esi:")) {
      const popped = context.tags.pop();

      if (!context.isInPlainText()) {
        if (popped && popped.close) return popped.close(next);
        return next();
      }
    }

    context.writeToResult({ name }, next);
  }
  ontext(text, next) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ text });
      return next();
    }

    if (!context.isProcessing()) {
      return context.writeToResult({ text }, next);
    }

    const current = context.tags[context.tags.length - 1];
    if (context.bufferingString && current.text) {
      text = current.text + text;
    }

    try {
      return context.writeToResult((currentContext) => {
        const result = { text: replace(text, currentContext || context) };
        context.bufferingString = false;
        return result;
      }, next); // handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.bufferingString = true;
        current.text = text;
        return next();
      }

      return next(err);
    }
  }
  makeAttributes(data) {
    if (!data) return {};

    const context = this.context;
    return Object.keys(data).reduce((attributes, key) => {
      let value = data[key];
      if (context.isProcessing()) {
        value = replace(value, context);
      }
      attributes[key] = value || "";
      return attributes;
    }, {});
  }
}

module.exports = ESIEvaluator;
