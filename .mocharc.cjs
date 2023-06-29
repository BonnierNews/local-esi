process.env.NODE_ENV = "test";

const nock = require("nock");
const chai = require("chai");

chai.config.truncateThreshold = 0;
chai.config.includeStack = true;

global.expect = chai.expect;

nock.enableNetConnect(/(localhost|127\.0\.0\.1):\d+/);

module.exports = {
  timeout: 1000,
  reporter: "spec",
  recursive: true,
}
