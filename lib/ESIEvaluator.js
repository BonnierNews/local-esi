/* eslint-disable no-use-before-define */
import HTMLStream from "@bonniernews/atlas-html-stream";

import { assign, test, replace } from "./evaluateExpression.js";
import ESIBase from "./ESIBase.js";

class ESITag {
  constructor(context) {
    this.context = context;
  }
  open() {
  }
  close() {
  }
}

class ESITry extends ESITag {
  constructor(...args) {
    super(...args);
    this.children = [];
  }
  assertChild(name) {
    this.children.push(name);
    if (![ "esi:attempt", "esi:except" ].includes(name)) {
      throw new Error(`${name} is not allowed inside an esi:try`);
    }
  }
  open() {
    this.context.tries.push({ success: true, chunks: [] });
  }
  close(controller) {
    if (!this.children.includes("esi:attempt")) {
      return controller.error(new Error("esi:try without esi:attempt not allowed"));
    }
    this.children.length = 0;

    const { chunks } = this.context.tries.pop();
    if (this.context.tries.length) {
      this.context.tries.at(-1).chunks.push(...chunks);
      return;
    }

    const enqueue = controller.enqueue.bind(controller);
    this.context.writeToResult(chunks, enqueue);
  }
}

class ESIAttempt extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:attempt is not allowed outside esi:try");
    }
  }
  open() {
    this.context.tries.at(-1).inAttempt = true;
  }
  close() {
    this.context.tries.at(-1).inAttempt = false;
    if (!this.context.tries.at(-1).success) {
      this.context.tries.at(-1).chunks.length = 0;
    }
  }
}

class ESIExcept extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESITry)) {
      throw new Error("esi:except is not allowed outside esi:try");
    }
  }
  open() {
    this.context.tries.at(-1).inExcept = true;
  }
  close() {
    this.context.tries.at(-1).inExcept = false;
  }
}

class ESIChoose extends ESITag {
  constructor(...args) {
    super(...args);
    this.children = [];
  }
  assertChild(name) {
    this.children.push(name);
    if (![ "esi:when", "esi:otherwise" ].includes(name)) {
      throw new Error(`${name} is not allowed inside a esi:choose`);
    }
  }
  open() {
    this.context.chooses.push({ testMatched: false, chosen: false });
  }
  close(controller) {
    if (!this.children.includes("esi:when")) {
      return controller.error(new Error("esi:choose without esi:when not allowed"));
    }
    this.children.length = 0;
    this.context.chooses.pop();
  }
}

class ESIWhen extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:when is not allowed outside esi:choose");
    }
  }
  open(data, controller) {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];

    let result;
    try {
      result = test(data.test, context);
    } catch (err) {
      return controller.error(err);
    }

    if (lastChoose.testMatched) {
      lastChoose.chosen = false;
      return;
    }

    if (data.matchname) {
      context.assigns[data.matchname] = result;
    }

    lastChoose.testMatched = lastChoose.chosen = !!result;

    return;
  }
}

class ESIOtherwise extends ESITag {
  assertParent(parent) {
    if (!(parent instanceof ESIChoose)) {
      throw new Error("esi:otherwise is not allowed outside esi:choose");
    }
  }
  open() {
    const context = this.context;
    const lastChoose = context.chooses[context.chooses.length - 1];
    lastChoose.chosen = !lastChoose.testMatched;
    return;
  }
}

class ESIText extends ESITag {
  get plainText() {
    return true;
  }
}

class ESIAssign extends ESITag {
  open(data, controller) {
    const context = this.context;
    if (!context.shouldWrite()) {
      return;
    }

    const value = data.value;
    try {
      context.assigns[data.name] = assign(value, context);
    } catch (err) {
      if (/unknown keyword/i.test(err.message)) context.assigns[data.name] = value;
      else return controller.error(err);
    }
  }
}

class ESIBreak extends ESITag {
  open(data, controller) {
    const context = this.context;
    if (!context.inForeach) return controller.error(new Error("esi:break outside esi:foreach"));
    context.breakHit = context.breakHit || context.shouldWrite();
    if (context.breakHit) controller.enqueue({ name: "esi:break" });
  }
}

class ESIEval extends ESITag {
  async open(data, controller) {
    const context = this.context;
    if (!context.shouldWrite()) return;
    const enqueue = controller.enqueue.bind(controller);
    const chunks = [];
    try {
      const fetchStream = await context.fetch(data);
      const htmlTransformer = new HTMLStream({ preserveWS: true });
      const esiTransformer = new ESIBase(new ESIEvaluator(context.clone(true)));
      const writeStream = new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      });
      await fetchStream.pipeThrough(htmlTransformer).pipeThrough(esiTransformer).pipeTo(writeStream);
      context.writeToResult(chunks, enqueue);
    } catch (err) {
      if (err.inAttempt) return;
      controller.error(err);
    }
  }
}

class ESIInclude extends ESITag {
  async open(data, controller) {
    const context = this.context;
    if (!context.shouldWrite()) return;
    const enqueue = controller.enqueue.bind(controller);
    const chunks = [];
    try {
      const fetchStream = await context.fetch(data);
      const htmlTransformer = new HTMLStream({ preserveWS: true });
      const writeStream = new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      });
      let stream;
      if (data.dca === "esi") {
        const esiTransformer = new ESIBase(new ESIEvaluator(context.clone()));
        stream = fetchStream.pipeThrough(htmlTransformer).pipeThrough(esiTransformer).pipeTo(writeStream);
      } else {
        stream = fetchStream.pipeThrough(htmlTransformer).pipeTo(writeStream);
      }
      await stream;
      context.writeToResult(chunks, enqueue);
    } catch (err) {
      if (err.inAttempt) return;
      controller.error(err);
    }
  }
}

class ESIForEach extends ESITag {
  open(data) {
    const context = this.context;
    context.items = assign(data.collection, context);
    if (!Array.isArray(context.items)) {
      context.items = Object.entries(context.items);
    }
    context.itemVariableName = data.item || "item";

    context.foreachChunks = [];
    return;
  }
  async close(controller) {
    const context = this.context;
    const foreachChunks = context.foreachChunks;
    delete context.foreachChunks;

    let buffered = [];

    for (let value of context.items) {
      if (Array.isArray(value)) value = `[${value.map((v) => typeof v === "string" ? `'${v}'` : v).join(",")}]`;

      buffered = buffered.concat([ { name: "esi:assign", data: { name: context.itemVariableName, value: value.toString() } }, { name: "esi:assign" } ], foreachChunks);
    }
    const localContext = context.subContext();
    localContext.inForeach = true;

    // TODO: Replace with ReadbleStream.from when compute @ edge implements it
    const readableStream = new ReadableStream({
      start(c) {
        for (const chunk of buffered) {
          c.enqueue(chunk);
        }
        c.close();
      },
    });
    const esiTransformer = new ESIBase(new ESIEvaluator(localContext));
    const transformedStream = readableStream.pipeThrough(esiTransformer);
    const reader = transformedStream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value.name === "esi:break") {
        return;
      }
      const enqueue = controller.enqueue.bind(controller);
      context.writeToResult(value, enqueue);
    }
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
  "esi:try": ESITry,
  "esi:vars": ESITag,
  "esi:when": ESIWhen,
  "esi:eval": ESIEval,
  "esi:include": ESIInclude,
  "esi:foreach": ESIForEach,
};

export default class ESIEvaluator {
  constructor(context) {
    this.context = context;
  }
  async onopentag(name, data, controller) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ name, data });
      return;
    }

    if (name.startsWith("esi:")) {
      const Tag = EsiTags[name];
      const wasInPlainText = context.isInPlainText();
      if (!Tag && !wasInPlainText) {
        throw new Error(`ESI tag ${name} not implemented.`);
      }
      let esiFunc;
      if (Tag) esiFunc = new Tag(context);
      const tags = context.tags;
      const idx = context.tags.push(esiFunc);
      const parent = tags[idx - 2];
      if (parent?.assertChild) {
        try {
          parent.assertChild(name);
        } catch (err) {
          return controller.error(err);
        }
      }
      if (esiFunc?.assertParent) {
        try {
          esiFunc.assertParent(parent);
        } catch (err) {
          return controller.error(err);
        }
      }
      if (!wasInPlainText) return await esiFunc.open(data, controller);
    }

    let enqueue = controller.enqueue.bind(controller);
    if (context.tries.length) {
      enqueue = this.bufferedEnqueue.bind(this);
    }
    context.writeToResult({ name, data: this.makeAttributes(data) }, enqueue);
  }
  async onclosetag(name, controller) {
    const context = this.context;
    if (name !== "esi:foreach" && context.foreachChunks) {
      context.foreachChunks.push({ name });
      return;
    }

    if (name.startsWith("esi:")) {
      const popped = context.tags.pop();

      if (!context.isInPlainText()) {
        if (popped && popped.close) {
          return await popped.close(controller);
        }
        return;
      }
    }

    let enqueue = controller.enqueue.bind(controller);
    if (context.tries.length) {
      enqueue = this.bufferedEnqueue.bind(this);
    }
    context.writeToResult({ name }, enqueue);
  }
  ontext(text, controller) {
    const context = this.context;
    if (context.foreachChunks) {
      context.foreachChunks.push({ text });
      return;
    }

    let enqueue = controller.enqueue.bind(controller);
    if (!context.isProcessing()) {
      return context.writeToResult({ text }, enqueue);
    }

    const current = context.tags[context.tags.length - 1];
    if (context.bufferingString && current.text) {
      text = current.text + text;
    }

    try {
      if (context.tries.length) {
        enqueue = this.bufferedEnqueue.bind(this);
      }

      return context.writeToResult((currentContext) => {
        const result = { text: replace(text, currentContext || context) };
        context.bufferingString = false;
        return result;
      }, enqueue); // handleProcessingInstructions may cause an (expected) error and we're not sure writeToResult will actually write so we pass a function that it can call if it should write
    } catch (err) {
      if (err.message.includes("Found end of file before end")) {
        context.bufferingString = true;
        current.text = text;
        return;
      } else {
        return controller.error(err);
      }
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
  bufferedEnqueue(chunk) {
    if (chunk) this.context.tries.at(-1).chunks.push(chunk);
  }
}
