import { readState, writeState } from "./release-state.mjs";

const statePath = process.env.FAKE_RELEASE_STATE;
if (statePath === undefined) throw new Error("exact fake fetch requires the explicit fixture state");

const originalFetch = globalThis.fetch;
const oidcUrl = "https://pipelinesghubeus13.actions.githubusercontent.com/ABCDEFGHIJKLMNOPQRSTUVWX/"
  + "00000000-0000-4000-8000-000000000001/_apis/distributedtask/hubs/Actions/plans/"
  + "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345/jobs/ZYXWVUTSRQPONMLKJIHGFEDCBA987654/"
  + "idtoken?api-version=2.0&audience=npm%3Aregistry.npmjs.org";
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.href !== oidcUrl) {
    return await originalFetch(input, init);
  }
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const authorization = headers.get("authorization");
  if (authorization !== `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`) {
    throw new Error("exact fake fetch observed the wrong OIDC authorization header");
  }
  const state = readState(statePath);
  state.inProcessFetches ??= [];
  state.inProcessFetches.push({
    authorization: "Bearer <redacted>",
    method: init.method ?? "GET",
    url: url.href,
  });
  writeState(statePath, state);
  const response = new Response(JSON.stringify({ value: state.api.oidcProvider.token }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
  Object.defineProperty(response, "url", { value: url.href });
  return response;
};
