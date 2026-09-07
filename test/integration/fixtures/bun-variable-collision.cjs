// Bun 1.4.1 incorrectly renamed these bindings to the same generated variable.
function meaning() {
  {
    let exports2 = { answer: 42 };
    var exports = exports2;
  }
  return exports;
}
module.exports = meaning();
console.log(module.exports.answer);
