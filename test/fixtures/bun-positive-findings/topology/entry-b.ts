import { shared } from "./shared.ts";
import "./style.css";

console.log("topology-entry-b", shared);
void import("./lazy.ts").then(({ lazy }) => console.log(lazy));
