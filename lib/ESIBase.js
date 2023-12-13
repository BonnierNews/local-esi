export default class ESIBase extends TransformStream {
  constructor(evaluator) {
    super({
      transform: async (chunk, controller) => {
        await this.transform(chunk, controller);
      },
    });
    this.evaluator = evaluator;
    this.context = evaluator.context;
  }
  addEventListener(...args) {
    this.context.emitter.addEventListener(...args);
  }

  async transform(chunk, controller) {
    const { name, data, text } = chunk;
    if (text) {
      return await this.evaluator.ontext(text, controller);
    } else if (name && data) {
      return await this.evaluator.onopentag(name, data, controller);
    } else {
      return await this.evaluator.onclosetag(name, controller);
    }
  }
}
