import { catalog } from "./catalog.ts";

console.log(JSON.stringify({
  products: catalog.length,
  units: catalog.reduce((total, product) => total + product.stock, 0),
  outOfStock: catalog.filter((product) => product.stock === 0).map((product) => product.sku),
}));
