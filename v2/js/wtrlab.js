/**
 * Source script for wtr-lab.com
 */
//@ts-check

/**
 * Normalizes a URL to be absolute with https and no duplicate path slashes.
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    if (!clean || clean === "#" || clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (clean.startsWith("wtr-lab.com") || clean.startsWith("img.wtr-lab.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://wtr-lab.com${clean.startsWith("/") ? "" : "/"}${clean}`;
    }

    const match = clean.match(/^(https:\/\/[^/?#]+)([^?#]*)([\s\S]*)$/);
    if (match) {
        const origin = match[1];
        const pathname = match[2].replace(/\/+/g, "/");
        const rest = match[3];
        return origin + pathname + rest;
    }
    return clean;
}

/**
 * Decodes standard HTML entities.
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
    if (!str || typeof str !== "string") return "";
    return str
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&#039;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lsquo;/gi, "‘")
        .replace(/&rsquo;/gi, "’")
        .replace(/&ldquo;/gi, "“")
        .replace(/&rdquo;/gi, "”")
        .replace(/&hellip;/gi, "...")
        .replace(/&mdash;/gi, "—")
        .replace(/&ndash;/gi, "–")
        .replace(/&#(\d+);/g, (_, dec) => {
            /* Convert number html code entities */
            try {
                const code = parseInt(dec, 10);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            /* Convert hex html code entities */
            try {
                const code = parseInt(hex, 16);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        });
}

/**
 * Decodes WTR-LAB macro tokens such as %{Soul Land|RG91bHVv} to "Soul Land".
 * @param {string} text
 * @returns {string}
 */
function cleanMacroText(text) {
    if (!text || typeof text !== "string") return "";
    return text.replace(/%\{([^|}]+)(?:\|[^}]*)?\}/g, "$1").trim();
}

/** Guests can read the AI translation of the first 10 chapters only; later chapters use "web". */
const GUEST_AI_CHAPTER_LIMIT = 10;

/** AES-256-GCM key the WTR-LAB reader uses to decrypt chapter bodies, from the site's reader script. */
const CONTENT_KEY = "IJAFUUxjM25hyzL2AZrn0wl7cESED6Ru";

/** Public Google Translate key the WTR-LAB reader uses to translate "web" chapters in the browser. */
const GOOGLE_TRANSLATE_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";

/** Maximum characters per Google Translate request, as used by the WTR-LAB reader. */
const TRANSLATE_CHUNK_CHARS = 3000;

/**
 * Escapes the characters that have a meaning in HTML text.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Returns the English text of glossary entry `index`, or "" if there is none.
 * @param {Array<any>} terms - glossary_data.terms of a chapter.
 * @param {number} index
 * @returns {string}
 */
function getGlossaryTerm(terms, index) {
    const entry = terms && terms[index];
    if (!entry) return "";
    const term = Array.isArray(entry)
        ? entry[0]
        : (typeof entry === "string" ? entry : (entry.target || entry.en || ""));
    return term != null && term !== "" ? cleanMacroText(decodeHtmlEntities(String(term))) : "";
}

/**
 * Returns the raw Chinese text of glossary entry `index`, or "" if there is none.
 * @param {Array<any>} terms - glossary_data.terms of a chapter.
 * @param {number} index
 * @returns {string}
 */
function getRawGlossaryTerm(terms, index) {
    const entry = terms && terms[index];
    return Array.isArray(entry) && entry[1] ? String(entry[1]).replace(/_/g, "") : "";
}

/**
 * Decodes a standard or URL-safe base64 string.
 * @param {string} str
 * @returns {Uint8Array}
 */
function base64ToBytes(str) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = str.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let buffer = 0;
    let bits = 0;
    let length = 0;
    for (let i = 0; i < clean.length; i++) {
        buffer = ((buffer << 6) | alphabet.indexOf(clean[i])) & 0xffff;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[length++] = (buffer >>> bits) & 0xff;
        }
    }
    return out.subarray(0, length);
}

/**
 * Decodes UTF-8 bytes to a string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function utf8Decode(bytes) {
    let result = "";
    /** @type {number[]} */
    const units = [];
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i++];
        let cp;
        if (b < 0x80) {
            cp = b;
        } else if (b < 0xe0) {
            cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
        } else if (b < 0xf0) {
            cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        } else {
            cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        }
        if (cp > 0xffff) {
            cp -= 0x10000;
            units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
            units.push(cp);
        }
        // Flush regularly to keep String.fromCharCode below the engine's argument limit
        if (units.length >= 8192) {
            result += String.fromCharCode.apply(null, units);
            units.length = 0;
        }
    }
    return result + String.fromCharCode.apply(null, units);
}

/**
 * Multiplies a byte by x in GF(2^8).
 * @param {number} b
 * @returns {number}
 */
function xtime(b) {
    return ((b << 1) ^ ((b & 0x80) ? 0x1b : 0)) & 0xff;
}

/** @type {{ sbox: Uint8Array, t0: Uint32Array, t1: Uint32Array, t2: Uint32Array, t3: Uint32Array } | null} */
let aesTables = null;

/**
 * Returns the AES S-box and encryption T-tables, building them on first use.
 */
function getAesTables() {
    if (aesTables) return aesTables;
    const exp = new Uint8Array(256);
    const log = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
        exp[i] = x;
        log[x] = i;
        x ^= xtime(x);
    }
    const sbox = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        const inv = i === 0 ? 0 : exp[(255 - log[i]) % 255];
        let s = inv;
        let r = inv;
        for (let j = 0; j < 4; j++) {
            r = ((r << 1) | (r >>> 7)) & 0xff;
            s ^= r;
        }
        sbox[i] = s ^ 0x63;
    }
    const t0 = new Uint32Array(256);
    const t1 = new Uint32Array(256);
    const t2 = new Uint32Array(256);
    const t3 = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        const s = sbox[i];
        const s2 = xtime(s);
        const s3 = s2 ^ s;
        t0[i] = (s2 << 24) | (s << 16) | (s << 8) | s3;
        t1[i] = (s3 << 24) | (s2 << 16) | (s << 8) | s;
        t2[i] = (s << 24) | (s3 << 16) | (s2 << 8) | s;
        t3[i] = (s << 24) | (s << 16) | (s3 << 8) | s2;
    }
    aesTables = { sbox, t0, t1, t2, t3 };
    return aesTables;
}

/**
 * Expands a 32-byte AES-256 key into its 60 round key words.
 * @param {Uint8Array} key
 * @returns {Uint32Array}
 */
function expandAesKey(key) {
    const { sbox } = getAesTables();
    const subWord = (/** @type {number} */ w) =>
        (sbox[w >>> 24] << 24) | (sbox[(w >>> 16) & 255] << 16) | (sbox[(w >>> 8) & 255] << 8) | sbox[w & 255];
    const w = new Uint32Array(60);
    for (let i = 0; i < 8; i++) {
        w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }
    let rcon = 1;
    for (let i = 8; i < 60; i++) {
        let temp = w[i - 1];
        if (i % 8 === 0) {
            temp = subWord((temp << 8) | (temp >>> 24)) ^ (rcon << 24);
            rcon = xtime(rcon);
        } else if (i % 8 === 4) {
            temp = subWord(temp);
        }
        w[i] = w[i - 8] ^ temp;
    }
    return w;
}

/**
 * Encrypts one block of four big-endian words with AES-256 and writes the result to `out`.
 * @param {Uint32Array} rk - round keys from expandAesKey.
 * @param {ArrayLike<number>} input
 * @param {number[]} out
 * @returns {number[]}
 */
function aesEncryptBlock(rk, input, out) {
    const { sbox, t0, t1, t2, t3 } = getAesTables();
    let s0 = input[0] ^ rk[0];
    let s1 = input[1] ^ rk[1];
    let s2 = input[2] ^ rk[2];
    let s3 = input[3] ^ rk[3];
    let k = 4;
    for (let round = 1; round < 14; round++) {
        const n0 = t0[s0 >>> 24] ^ t1[(s1 >>> 16) & 255] ^ t2[(s2 >>> 8) & 255] ^ t3[s3 & 255] ^ rk[k];
        const n1 = t0[s1 >>> 24] ^ t1[(s2 >>> 16) & 255] ^ t2[(s3 >>> 8) & 255] ^ t3[s0 & 255] ^ rk[k + 1];
        const n2 = t0[s2 >>> 24] ^ t1[(s3 >>> 16) & 255] ^ t2[(s0 >>> 8) & 255] ^ t3[s1 & 255] ^ rk[k + 2];
        const n3 = t0[s3 >>> 24] ^ t1[(s0 >>> 16) & 255] ^ t2[(s1 >>> 8) & 255] ^ t3[s2 & 255] ^ rk[k + 3];
        s0 = n0;
        s1 = n1;
        s2 = n2;
        s3 = n3;
        k += 4;
    }
    out[0] = ((sbox[s0 >>> 24] << 24) | (sbox[(s1 >>> 16) & 255] << 16) | (sbox[(s2 >>> 8) & 255] << 8) | sbox[s3 & 255]) ^ rk[k];
    out[1] = ((sbox[s1 >>> 24] << 24) | (sbox[(s2 >>> 16) & 255] << 16) | (sbox[(s3 >>> 8) & 255] << 8) | sbox[s0 & 255]) ^ rk[k + 1];
    out[2] = ((sbox[s2 >>> 24] << 24) | (sbox[(s3 >>> 16) & 255] << 16) | (sbox[(s0 >>> 8) & 255] << 8) | sbox[s1 & 255]) ^ rk[k + 2];
    out[3] = ((sbox[s3 >>> 24] << 24) | (sbox[(s0 >>> 16) & 255] << 16) | (sbox[(s1 >>> 8) & 255] << 8) | sbox[s2 & 255]) ^ rk[k + 3];
    return out;
}

/**
 * Multiplies two 128-bit blocks of four big-endian words in GCM's GF(2^128).
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number[]}
 */
function gfMultiply(x, y) {
    let z0 = 0, z1 = 0, z2 = 0, z3 = 0;
    let v0 = y[0], v1 = y[1], v2 = y[2], v3 = y[3];
    for (let i = 0; i < 128; i++) {
        if ((x[i >>> 5] >>> (31 - (i & 31))) & 1) {
            z0 ^= v0;
            z1 ^= v1;
            z2 ^= v2;
            z3 ^= v3;
        }
        const lsb = v3 & 1;
        v3 = (v3 >>> 1) | (v2 << 31);
        v2 = (v2 >>> 1) | (v1 << 31);
        v1 = (v1 >>> 1) | (v0 << 31);
        v0 = (v0 >>> 1) ^ (lsb ? 0xe1000000 : 0);
    }
    return [z0, z1, z2, z3];
}

/**
 * Decrypts `data` with AES-256-GCM. The authentication tag is not checked.
 * @param {Uint8Array} key - 32 bytes.
 * @param {Uint8Array} iv
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function aesGcmDecrypt(key, iv, data) {
    const rk = expandAesKey(key);
    const readWord = (/** @type {Uint8Array} */ bytes, /** @type {number} */ offset) =>
        ((bytes[offset] || 0) << 24) | ((bytes[offset + 1] || 0) << 16) | ((bytes[offset + 2] || 0) << 8) | (bytes[offset + 3] || 0);

    // The initial counter block J0 is iv || 1 for 96-bit IVs and GHASH(iv) otherwise
    let counter;
    if (iv.length === 12) {
        counter = [readWord(iv, 0), readWord(iv, 4), readWord(iv, 8), 1];
    } else {
        const h = aesEncryptBlock(rk, [0, 0, 0, 0], [0, 0, 0, 0]);
        let y = [0, 0, 0, 0];
        for (let offset = 0; offset < iv.length; offset += 16) {
            y = gfMultiply([
                y[0] ^ readWord(iv, offset),
                y[1] ^ readWord(iv, offset + 4),
                y[2] ^ readWord(iv, offset + 8),
                y[3] ^ readWord(iv, offset + 12)
            ], h);
        }
        counter = gfMultiply([y[0], y[1], y[2], y[3] ^ (iv.length * 8)], h);
    }

    // Data blocks are XORed with the encrypted counter, starting at J0 + 1
    const out = new Uint8Array(data.length);
    const keystream = [0, 0, 0, 0];
    for (let offset = 0; offset < data.length; offset += 16) {
        counter[3] = (counter[3] + 1) >>> 0;
        aesEncryptBlock(rk, counter, keystream);
        const end = Math.min(16, data.length - offset);
        for (let i = 0; i < end; i++) {
            out[offset + i] = data[offset + i] ^ ((keystream[i >> 2] >>> (24 - 8 * (i & 3))) & 0xff);
        }
    }
    return out;
}

/**
 * Decrypts a chapter body that WTR-LAB encrypted with AES-256-GCM. The payload is "arr:" or "str:"
 * followed by "iv:tag:ciphertext" in base64, and "arr:" bodies hold a JSON array of paragraphs.
 * @param {string} payload
 * @returns {Array<string> | string}
 */
function decryptChapterBody(payload) {
    const isArray = payload.startsWith("arr:");
    const rest = isArray || payload.startsWith("str:") ? payload.substring(4) : payload;
    const parts = rest.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted chapter content format");
    }
    const key = new Uint8Array(32);
    for (let i = 0; i < key.length; i++) key[i] = CONTENT_KEY.charCodeAt(i);

    const text = utf8Decode(aesGcmDecrypt(key, base64ToBytes(parts[0]), base64ToBytes(parts[2])));
    if (!isArray) return text;
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error("Failed to decrypt chapter content: " + e.message);
    }
}

/**
 * Translates HTML parts from Chinese to English with the Google Translate endpoint the WTR-LAB
 * reader uses, and returns the translated parts in the same order.
 * @param {Array<string>} htmlParts
 * @returns {Promise<Array<string>>}
 */
async function googleTranslateHtml(htmlParts) {
    const translateUrl = "https://translate-pa.googleapis.com/v1/translateHtml";
    const body = JSON.stringify([[htmlParts, "zh-CN", "en"], "te_lib"]);
    const headers = {
        "Content-Type": "application/json+protobuf",
        "X-Goog-API-Key": GOOGLE_TRANSLATE_KEY
    };

    let resp = await http.post(translateUrl, body, headers);
    if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
        resp = await http.post(translateUrl, body, headers);
    }
    if (!resp || resp.status !== 200 || !resp.body) {
        throw new Error(`Failed to translate chapter: HTTP ${resp ? resp.status : "unknown"}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(resp.body);
    } catch (e) {
        throw new Error(`Failed to parse translation response: ${e.message}`);
    }
    if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) {
        throw new Error("Unexpected translation response");
    }
    return parsed[0].map(t => (typeof t === "string" ? t : ""));
}

/**
 * Translates the raw Chinese paragraphs of a "web" chapter to English the way the WTR-LAB reader
 * does: glossary placeholders become the English terms, wrapped in tags so that Google keeps them.
 * @param {Array<any>} paragraphs
 * @param {Array<any>} terms - glossary_data.terms of the chapter.
 * @returns {Promise<Array<string>>}
 */
async function translateWebParagraphs(paragraphs, terms) {
    const htmlParagraphs = [];
    for (const p of paragraphs) {
        if (!p || typeof p !== "string") continue;
        const text = p.replace(/\[part:[^\]]*\]/gi, "").replace(/\[image[^\]]*\]/gi, "").trim();
        if (!text) continue;

        // Replace glossary placeholders: ※{index}[⛬〓]
        htmlParagraphs.push(escapeHtml(text).replace(/※(\d+)[⛬〓]?/g, (match, idx) => {
            const i = parseInt(idx, 10);
            const term = getGlossaryTerm(terms, i);
            if (term) return `<a i=${i}>${escapeHtml(term)}</a>`;
            const rawTerm = getRawGlossaryTerm(terms, i);
            return rawTerm ? escapeHtml(rawTerm) : match;
        }));
    }

    const chunks = [];
    let chunk = [];
    let chunkChars = 0;
    for (const p of htmlParagraphs) {
        if (chunk.length > 0 && chunkChars + p.length > TRANSLATE_CHUNK_CHARS) {
            chunks.push(chunk);
            chunk = [];
            chunkChars = 0;
        }
        chunk.push(p);
        chunkChars += p.length;
    }
    if (chunk.length > 0) chunks.push(chunk);

    const translated = await Promise.all(chunks.map(googleTranslateHtml));

    // All markup in the result comes from the request since the text itself was escaped
    return translated.flat()
        .map(html => cleanMacroText(decodeHtmlEntities(html.replace(/<[^>]*>/g, ""))).trim())
        .filter(t => t.length > 0);
}

/**
 * Loads the data of chapter `chapterNo` of novel `rawId` as translated by `translate` ("ai" or
 * "web") from the WTR-LAB reader API.
 * @param {number} rawId
 * @param {number} chapterNo
 * @param {string} translate
 * @param {string} referer - chapter page URL.
 * @returns {Promise<any>} the chapter data, or null if the translation needs a logged in user.
 */
async function fetchReaderData(rawId, chapterNo, translate, referer) {
    // Step 1: POST /api/reader/get
    const readerPayload = {
        translate,
        language: "en",
        raw_id: rawId,
        chapter_no: chapterNo
    };

    let readerResp = await http.post("https://wtr-lab.com/api/reader/get", readerPayload, { "Referer": referer });
    if ((!readerResp || readerResp.status !== 200) && (!readerResp || readerResp.status === 429 || readerResp.status >= 500)) {
        readerResp = await http.post("https://wtr-lab.com/api/reader/get", readerPayload, { "Referer": referer });
    }

    if (!readerResp || readerResp.status !== 200 || !readerResp.body) {
        throw new Error(`Failed to request chapter reader: HTTP ${readerResp ? readerResp.status : "unknown"}`);
    }

    let readerJson;
    try {
        readerJson = JSON.parse(readerResp.body);
    } catch (e) {
        if (readerResp.body && (readerResp.body.includes("Just a moment...") || readerResp.body.includes("challenge-running") || readerResp.body.includes("cf-turnstile"))) {
            throw new Error("WTR-LAB security check required: Cloudflare Turnstile challenge triggered. Complete verification at https://wtr-lab.com/profile/challenge");
        }
        throw new Error(`Failed to parse chapter reader response (status ${readerResp.status}): ${e.message}`);
    }

    if (!readerJson.success) {
        if (readerJson.requireTurnstile) {
            throw new Error("WTR-LAB security check required: Cloudflare Turnstile challenge triggered. Complete verification at https://wtr-lab.com/profile/challenge");
        }
        if (readerJson.code === 1401) {
            return null;
        }
        throw new Error(`Failed to load chapter: ${readerJson.error || readerJson.message || "Unknown error"}`);
    }

    let contentJson = readerJson;
    const contentUrl = readerJson.content_url;
    if (contentUrl && !readerJson.data) {
        const fullContentUrl = contentUrl.startsWith("http") ? contentUrl : `https://wtr-lab.com${contentUrl}`;

        // Step 2: GET content_url
        let contentResp = await http.get(fullContentUrl, { "Accept": "application/json, text/plain, */*", "Referer": referer });
        if ((!contentResp || contentResp.status !== 200) && (!contentResp || contentResp.status === 429 || contentResp.status >= 500)) {
            contentResp = await http.get(fullContentUrl, { "Accept": "application/json, text/plain, */*", "Referer": referer });
        }

        if (!contentResp || contentResp.status !== 200 || !contentResp.body) {
            throw new Error(`Failed to fetch chapter content: HTTP ${contentResp ? contentResp.status : "unknown"}`);
        }

        try {
            contentJson = JSON.parse(contentResp.body);
        } catch (e) {
            throw new Error(`Failed to parse chapter content response (status ${contentResp.status}): ${e.message}`);
        }
    } else if (!readerJson.data) {
        throw new Error("No content_url returned by reader API");
    }

    return contentJson.data?.data || contentJson.data || {};
}

const source = {
    /**
     * Search novels matching a query string.
     * @param {string} query - Search keyword.
     * @param {number} page - 1-based page index.
     * @returns {Promise<Array<{ title: string, link: string, imgSrc: string }>>}
     */
    async searchNovels(query, page = 1) {
        if (!query || !query.trim()) return [];

        const trimmed = query.trim();
        const p = Math.max(1, parseInt(page, 10) || 1);

        const results = [];
        const seenLinks = new Set();

        // 1. Primary for page 1: POST /api/search with JSON payload
        // NOTE: /api/search is an instant search popup endpoint that ignores page parameter
        // and returns only top 10 matches. For page > 1, query novel-finder directly for true pagination.
        if (p === 1) {
            try {
                const searchApiUrl = "https://wtr-lab.com/api/search";
                let resp = await http.post(searchApiUrl, { text: trimmed }, { "Referer": "https://wtr-lab.com/en/novel-finder" });
                if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
                    resp = await http.post(searchApiUrl, { text: trimmed }, { "Referer": "https://wtr-lab.com/en/novel-finder" });
                }

                if (resp && resp.status === 200 && resp.body) {
                    const parsed = JSON.parse(resp.body);
                    const items = Array.isArray(parsed) ? parsed : (parsed.data || []);
                    for (const item of items) {
                        const rawId = item.raw_id || item.id;
                        if (!rawId) continue;
                        const slug = item.slug || "_";
                        const itemData = item.data || {};
                        const rawTitle = itemData.title || item.title || "";
                        const title = cleanMacroText(decodeHtmlEntities(rawTitle));
                        if (!title) continue;

                        const rawImg = itemData.image || item.image || "";
                        const imgSrc = rawImg ? toAbsoluteUrl(rawImg) : "";
                        const link = `https://wtr-lab.com/en/novel/${rawId}/${slug}`;

                        if (!seenLinks.has(link)) {
                            seenLinks.add(link);
                            results.push({ title, link, imgSrc });
                        }
                    }
                }
            } catch (e) {
                console.warn("WTR-LAB search API error: " + e.message);
            }
        }

        // 2. Query novel-finder for page > 1 or when page 1 returned no results
        if (results.length === 0) {
            try {
                const finderUrl = `https://wtr-lab.com/en/novel-finder?text=${encodeURIComponent(trimmed)}&page=${p}`;
                let resp = await http.get(finderUrl);
                if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
                    resp = await http.get(finderUrl);
                }

                if (resp && resp.status === 200 && resp.body) {
                    const nextMatch = resp.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
                    if (nextMatch) {
                        try {
                            const nextJson = JSON.parse(nextMatch[1]);
                            const seriesObj = nextJson.props?.pageProps?.series;
                            const seriesList = Array.isArray(seriesObj) ? seriesObj : (seriesObj?.data || []);
                            for (const item of seriesList) {
                                const rawId = item.raw_id || item.id;
                                if (!rawId) continue;
                                const slug = item.slug || "_";
                                const itemData = item.data || {};
                                const rawTitle = itemData.title || item.title || "";
                                const title = cleanMacroText(decodeHtmlEntities(rawTitle));
                                if (!title) continue;

                                const rawImg = itemData.image || item.image || "";
                                const imgSrc = rawImg ? toAbsoluteUrl(rawImg) : "";
                                const link = `https://wtr-lab.com/en/novel/${rawId}/${slug}`;

                                if (!seenLinks.has(link)) {
                                    seenLinks.add(link);
                                    results.push({ title, link, imgSrc });
                                }
                            }
                        } catch (err) {
                            console.warn("WTR-LAB finder NEXT_DATA parsing error: " + err.message);
                        }
                    }

                    if (results.length === 0) {
                        const $ = parseHtml(resp.body);
                        const cards = $("a[href*='/novel/']");
                        for (const a of cards) {
                            const href = a.attr("href");
                            if (!href || href.includes("/continue")) continue;
                            const link = toAbsoluteUrl(href);
                            if (!link || seenLinks.has(link)) continue;

                            const title = cleanMacroText(decodeHtmlEntities(a.attr("title") || a.text().trim()));
                            if (!title) continue;

                            const imgEl = a.first("img");
                            const imgSrc = imgEl ? toAbsoluteUrl(imgEl.attr("src") || imgEl.attr("data-src") || "") : "";

                            seenLinks.add(link);
                            results.push({ title, link, imgSrc });
                        }
                    }
                }
            } catch (e) {
                console.warn("WTR-LAB novel-finder fallback error: " + e.message);
            }
        }

        return results;
    },

    /**
     * Retrieve novel metadata and chapter list.
     * @param {string} novelUrl - Full URL or relative path to novel overview page.
     * @returns {Promise<{
     *   title: string,
     *   imageUrl: string,
     *   description: string,
     *   author: string,
     *   genres: string,
     *   tags: string,
     *   status: string,
     *   chapters: Array<{ title: string, link: string, text: string }>
     * }>}
     */
    async getNovel(novelUrl) {
        if (!novelUrl || !novelUrl.trim()) {
            throw new Error("novelUrl is required");
        }

        let cleanUrl = toAbsoluteUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }

        const urlMatch = cleanUrl.match(/\/novel\/(\d+)(?:\/([^/?#]+))?/i);
        let rawId = urlMatch ? parseInt(urlMatch[1], 10) : 0;
        let slug = urlMatch && urlMatch[2] ? urlMatch[2] : "";

        // If URL has no slug, Next.js returns 404 for /novel/{id}.
        // Using /novel/{id}/_ causes Next.js to redirect (307) to the canonical slug.
        if (rawId && (!slug || slug === "_")) {
            cleanUrl = `https://wtr-lab.com/en/novel/${rawId}/_`;
        }

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        let title = "";
        let imageUrl = "";
        let description = "";
        let author = "";
        let genres = "";
        let tags = "";
        let status = "Ongoing";
        let chapterCount = 0;

        // Extract from __NEXT_DATA__
        const nextMatch = resp.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (nextMatch) {
            try {
                const nextData = JSON.parse(nextMatch[1]);
                const pageProps = nextData.props?.pageProps || {};
                const serie = pageProps.serie || {};
                const serieData = serie.serie_data || {};
                const dataObj = serieData.data || {};

                title = cleanMacroText(decodeHtmlEntities(dataObj.title || serieData.title || ""));
                author = cleanMacroText(decodeHtmlEntities(dataObj.author || serieData.author || ""));
                imageUrl = toAbsoluteUrl(dataObj.image || serieData.image || "");
                description = cleanMacroText(decodeHtmlEntities(dataObj.description || serieData.description || ""));

                const rawStatus = serieData.status !== undefined ? serieData.status : serieData.raw_status;
                status = (rawStatus === 1) ? "Completed" : "Ongoing";

                chapterCount = serieData.chapter_count || serieData.raw_chapter_count || 0;
                if (!rawId && serieData.raw_id) rawId = serieData.raw_id;
                if ((!slug || slug === "_") && serieData.slug) slug = serieData.slug;

                if (Array.isArray(pageProps.tags)) {
                    tags = pageProps.tags
                        .map(t => cleanMacroText(decodeHtmlEntities(t.title || t.name || "")))
                        .filter(Boolean)
                        .join(", ");
                }
                // Map tags to genres so TinyScrap's UI renders them in the Genres section
                genres = tags;
            } catch (e) {
                console.warn("WTR-LAB parse NEXT_DATA error: " + e.message);
            }
        }

        // HTML DOM fallback for metadata if needed
        if (!title || !description || !author) {
            const $ = parseHtml(resp.body);
            if (!title) {
                const h1Text = $("h1").first()?.text() || "";
                if (h1Text) {
                    title = cleanMacroText(decodeHtmlEntities(h1Text));
                } else {
                    const ogTitle = $("meta[property='og:title']").attr("content") || "";
                    title = cleanMacroText(decodeHtmlEntities(ogTitle.replace(/^Read\s+/i, "").replace(/\s*-\s*WTR-LAB.*$/i, "")));
                }
            }
            if (!imageUrl) {
                const ogImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || "";
                if (ogImg) imageUrl = toAbsoluteUrl(ogImg);
            }
            if (!author) {
                author = cleanMacroText(decodeHtmlEntities($(".author, [itemprop='author']").first()?.text() || ""));
            }
            if (!description) {
                const descEl = $(".description, .synopsis, [itemprop='description']").first();
                description = descEl ? cleanMacroText(decodeHtmlEntities(descEl.text())) : ($("meta[name='description']").attr("content") || "");
            }
        }

        // Chapters
        const chapters = [];
        const seenChapterLinks = new Set();
        const effectiveSlug = (slug && slug !== "_") ? slug : "_";

        if (rawId) {
            const endCount = Math.max(chapterCount || 0, 5000);
            const chaptersApiUrl = `https://wtr-lab.com/api/chapters/${rawId}?start=1&end=${endCount}`;

            try {
                let chResp = await http.get(chaptersApiUrl, { "Accept": "application/json, text/plain, */*", "Referer": cleanUrl });
                if ((!chResp || chResp.status !== 200) && (!chResp || chResp.status === 429 || chResp.status >= 500)) {
                    chResp = await http.get(chaptersApiUrl, { "Accept": "application/json, text/plain, */*", "Referer": cleanUrl });
                }

                if (chResp && chResp.status === 200 && chResp.body) {
                    const parsed = JSON.parse(chResp.body);
                    const chapterList = Array.isArray(parsed) ? parsed : (parsed.chapters || []);
                    // Ensure sorted by order
                    chapterList.sort((a, b) => (parseFloat(a.order) || 0) - (parseFloat(b.order) || 0));

                    for (const ch of chapterList) {
                        const order = ch.order;
                        if (order === undefined || order === null) continue;
                        const chTitle = cleanMacroText(decodeHtmlEntities(ch.title || `Chapter ${order}`));
                        const chLink = `https://wtr-lab.com/en/novel/${rawId}/${effectiveSlug}/chapter-${order}`;

                        if (!seenChapterLinks.has(chLink)) {
                            seenChapterLinks.add(chLink);
                            chapters.push({
                                title: chTitle,
                                link: chLink,
                                text: ""
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("WTR-LAB fetch chapters API error: " + e.message);
            }
        }

        // DOM fallback for chapters if API failed
        if (chapters.length === 0) {
            const $ = parseHtml(resp.body);
            const chAnchors = $("a[href*='/chapter-']");
            for (const a of chAnchors) {
                const href = a.attr("href");
                if (!href) continue;
                const link = toAbsoluteUrl(href);
                if (!link || seenChapterLinks.has(link)) continue;

                const chTitle = cleanMacroText(decodeHtmlEntities(a.attr("title") || a.text().trim() || "Chapter"));
                seenChapterLinks.add(link);
                chapters.push({
                    title: chTitle,
                    link,
                    text: ""
                });
            }
            chapters.sort((a, b) => {
                const ma = a.link.match(/\/chapter-([\d.]+)/);
                const mb = b.link.match(/\/chapter-([\d.]+)/);
                const na = ma ? parseFloat(ma[1]) : 0;
                const nb = mb ? parseFloat(mb[1]) : 0;
                return na - nb;
            });
        }

        return {
            title,
            imageUrl,
            description,
            author,
            genres,
            tags,
            status,
            chapters
        };
    },

    /**
     * Retrieve text content for a single chapter.
     * @param {string} chapterUrl - Full URL or relative path to chapter reading page.
     * @returns {Promise<string>}
     */
    async getChapterText(chapterUrl) {
        if (!chapterUrl || !chapterUrl.trim()) return "";
        const cleanUrl = toAbsoluteUrl(chapterUrl);
        if (!cleanUrl) return "";

        let rawId = 0;
        /** @type {number | null} */
        let chapterNo = null;

        const urlMatch = cleanUrl.match(/\/novel\/(\d+)(?:\/[^/?#]+)*\/chapter-([\d.]+)/i);
        if (urlMatch) {
            rawId = parseInt(urlMatch[1], 10);
            chapterNo = parseFloat(urlMatch[2]);
        }

        // If not extractable from URL, fetch chapter page HTML to extract raw_id and order
        if (!rawId || chapterNo === null || isNaN(chapterNo)) {
            let pageResp = await http.get(cleanUrl);
            if ((!pageResp || pageResp.status !== 200) && (!pageResp || pageResp.status === 429 || pageResp.status >= 500)) {
                pageResp = await http.get(cleanUrl);
            }
            if (pageResp && pageResp.status === 200 && pageResp.body) {
                const nextMatch = pageResp.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
                if (nextMatch) {
                    try {
                        const nextData = JSON.parse(nextMatch[1]);
                        const ch = nextData.props?.pageProps?.serie?.chapter;
                        if (ch) {
                            rawId = ch.raw_id || ch.serie_id || 0;
                            if (ch.order !== undefined && ch.order !== null) {
                                chapterNo = typeof ch.order === "number" ? ch.order : parseFloat(ch.order);
                            }
                        }
                    } catch (e) {
                        console.warn("WTR-LAB parse chapter NEXT_DATA error: " + e.message);
                    }
                }
            }
        }

        if (!rawId || chapterNo === null || isNaN(chapterNo)) {
            throw new Error("Could not determine novel ID and chapter number from: " + chapterUrl);
        }

        // Guests only get AI translations of the first chapters. Later chapters are read from the
        // "web" service, which serves the raw Chinese text that the reader translates itself.
        let translate = chapterNo > GUEST_AI_CHAPTER_LIMIT ? "web" : "ai";
        let dataObj = await fetchReaderData(rawId, chapterNo, translate, cleanUrl);
        if (dataObj === null && translate === "ai") {
            translate = "web";
            dataObj = await fetchReaderData(rawId, chapterNo, translate, cleanUrl);
        }
        if (dataObj === null) {
            throw new Error("Failed to load chapter: WTR-LAB requires login for this chapter");
        }

        let rawBody = dataObj.body || [];
        if (dataObj.encrypted && typeof rawBody === "string") {
            rawBody = decryptChapterBody(rawBody);
        }
        const terms = dataObj.glossary_data?.terms || [];

        const bodyArray = Array.isArray(rawBody) ? rawBody : (typeof rawBody === "string" ? [rawBody] : []);

        if (translate === "web") {
            const translatedParagraphs = await translateWebParagraphs(bodyArray, terms);
            return translatedParagraphs.map(p => `<p>${p}</p>`).join("");
        }

        const cleanedParagraphs = bodyArray.map(p => {
            if (!p || typeof p !== "string") return "";
            // Remove model control tags
            let text = p.replace(/\[part:[^\]]*\]/gi, "").replace(/\[image[^\]]*\]/gi, "");
            text = decodeHtmlEntities(text);
            text = cleanMacroText(text);

            // Replace glossary placeholders: ※{index}[⛬〓]
            text = text.replace(/※(\d+)[⛬〓]?/g, (match, idx) => getGlossaryTerm(terms, parseInt(idx, 10)) || match);

            text = decodeHtmlEntities(text);
            text = cleanMacroText(text);
            return text.trim();
        }).filter(t => t.length > 0);

        return cleanedParagraphs.map(p => `<p>${p}</p>`).join("");
    }
};
