import { RelayApp } from "./app";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("missing #app");

await new RelayApp(root).start();
