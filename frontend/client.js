/**
 * Small browser-side ES module for the Gift Islands API.
 *
 * The functions return parsed JSON and reject non-2xx responses with
 * GiftIslandsApiError.  Pass an AbortSignal as `{ signal }` to cancel a
 * request; an AbortError is propagated unchanged.
 */

export class GiftIslandsApiError extends Error {
  constructor(message, { status = 0, code = "request_failed", detail = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "GiftIslandsApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function urlFor(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return `${base}${path}`;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, {
  baseUrl = "",
  fetchImpl = globalThis.fetch,
  method = "GET",
  payload,
  signal,
  headers = {},
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new GiftIslandsApiError("当前环境没有可用的 fetch。", { code: "fetch_unavailable" });
  }

  const requestHeaders = { Accept: "application/json", ...headers };
  const init = { method, headers: requestHeaders, signal };
  if (payload !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    init.body = JSON.stringify(payload);
  }

  let response;
  try {
    response = await fetchImpl(urlFor(baseUrl, path), init);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new GiftIslandsApiError("无法连接赠岛后端。", { code: "network_error", cause: error });
  }

  const data = await readResponse(response);
  if (response.ok) return data;

  const detail = data && typeof data === "object" ? data.detail : null;
  const code = detail && typeof detail === "object" && detail.code
    ? detail.code
    : `http_${response.status}`;
  const message = detail && typeof detail === "object" && detail.message
    ? detail.message
    : typeof detail === "string"
      ? detail
      : `请求失败（HTTP ${response.status}）。`;
  throw new GiftIslandsApiError(message, { status: response.status, code, detail });
}

export function getModels(options = {}) {
  return request("/api/v1/models", options);
}

export function validatePosition(position, options = {}) {
  return request("/api/v1/positions/validate", { ...options, method: "POST", payload: position });
}

export function playMove(positionAndMove, options = {}) {
  return request("/api/v1/play-move", { ...options, method: "POST", payload: positionAndMove });
}

export function aiMove(positionAndSearch, options = {}) {
  return request("/api/v1/ai-move", { ...options, method: "POST", payload: positionAndSearch });
}

/** Bind a base URL once for a frontend component or game session. */
export function createGiftIslandsClient({ baseUrl = "", fetchImpl = globalThis.fetch } = {}) {
  const defaults = { baseUrl, fetchImpl };
  return {
    getModels: (options = {}) => getModels({ ...defaults, ...options }),
    validatePosition: (position, options = {}) => validatePosition(position, { ...defaults, ...options }),
    playMove: (positionAndMove, options = {}) => playMove(positionAndMove, { ...defaults, ...options }),
    aiMove: (positionAndSearch, options = {}) => aiMove(positionAndSearch, { ...defaults, ...options }),
  };
}
