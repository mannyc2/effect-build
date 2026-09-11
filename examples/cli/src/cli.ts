// The program that ships. `index.ts` compiles it for every release target.
const [name = "world"] = process.argv.slice(2);
console.log(`Hello, ${name}!`);
