"use strict";

module.exports = (name, value, attributes) => {
  return Object.keys(attributes).reduce((acc, key) => {
    const val = attributes[key];
    if (val) {
      return `${acc}; ${key}=${val}`.trim();
    }
    return `${acc}; ${key}`.trim();
  }, `${name}=${value}`);
};
