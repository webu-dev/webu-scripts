/**
 * Source script for noveltrust.com
 */
//@ts-check

/**
 * Decodes standard HTML entities in text.
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
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&rsquo;|&lsquo;/gi, "'")
        .replace(/&rdquo;|&ldquo;/gi, "\"")
        .replace(/&hellip;|…/gi, "...")
        .replace(/&mdash;/gi, "—")
        .replace(/&ndash;/gi, "–")
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Normalizes a URL to be absolute with https and no double slashes in paths.
 * Returns empty string for invalid, non-navigable, or javascript URLs.
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = decodeHtmlEntities(url).trim();
    if (!clean || clean === "#" || clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (/^([a-z0-9-]+\.)*noveltrust\.com(\/|$)/i.test(clean)) {
        clean = `https://${clean}`;
    } else if (/^([a-z0-9-]+\.)*novellive\.app(\/|$)/i.test(clean)) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://noveltrust.com${clean.startsWith("/") ? "" : "/"}${clean}`;
    }

    clean = clean.replace(/^https?:\/\/www\.noveltrust\.com(\/|$)/i, "https://noveltrust.com$1");
    clean = clean.replace(/^https?:\/\/www\.novellive\.app(\/|$)/i, "https://novellive.app$1");

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
 * Extracts novel slug identifier from a URL or raw slug string.
 * @param {string} url
 * @returns {string}
 */
function extractSlug(url) {
    if (!url || typeof url !== "string") return "";
    const clean = url.trim().split("?")[0].split("#")[0];
    const match = clean.match(/\/book\/([^/?#]+)/i);
    if (match) return match[1].trim();
    if (!clean.includes("/") && !clean.includes(":") && clean.length > 0) {
        return clean;
    }
    return "";
}

/**
 * Normalizes a novel overview URL by ensuring base path https://noveltrust.com/book/{slug}.
 * Returns empty string if the URL does not correspond to a valid novel path or slug.
 * @param {string} url
 * @returns {string}
 */
function normalizeNovelUrl(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!trimmed || trimmed === "#" || trimmed.startsWith("javascript:") || trimmed.startsWith("data:")) {
        return "";
    }
    const slug = extractSlug(trimmed) || extractSlug(toAbsoluteUrl(trimmed));
    if (slug) {
        return `https://noveltrust.com/book/${slug}`;
    }
    return "";
}

/**
 * Checks for Cloudflare challenge pages and throws a descriptive error.
 * @param {object} resp
 */
function checkCloudflareChallenge(resp) {
    if (!resp) return;
    const status = resp.status;
    const body = resp.body || "";
    const headers = resp.headers || {};
    const serverHeader = (headers["server"] || "").toLowerCase();
    const hasCfHeader = !!(headers["cf-ray"] || headers["cf-mitigated"] || serverHeader.includes("cloudflare"));

    const isChallenge = (status === 403 || status === 503) ||
        body.includes("Just a moment...") ||
        body.includes("challenge-running") ||
        body.includes("_cf_chl_opt") ||
        body.includes("cf-turnstile") ||
        (hasCfHeader && status >= 400);

    if (isChallenge && (status === 403 || status === 503 || hasCfHeader || body.includes("Cloudflare") || body.includes("cloudflare") || body.includes("Just a moment..."))) {
        throw new Error("NovelTrust security check required: Cloudflare challenge triggered.");
    }
}

/**
 * Safe HTTP GET with retry on 429 or server errors.
 * @param {string} url
 * @param {object} [headers]
 * @param {number} [retries]
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url, headers = {}, retries = 1) {
    let resp = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            resp = await http.get(url, headers);
            checkCloudflareChallenge(resp);
            if (resp && resp.status === 200) {
                return resp;
            }
            if (resp && resp.status < 500 && resp.status !== 429) {
                return resp;
            }
        } catch (e) {
            if (e.message && e.message.includes("security check required")) {
                throw e;
            }
            if (attempt === retries) throw e;
        }
    }
    return resp;
}

/**
 * Safe HTTP POST with retry on 429 or server errors.
 * @param {string} url
 * @param {string|object} body
 * @param {object} [headers]
 * @param {number} [retries]
 * @returns {Promise<any>}
 */
async function postWithRetry(url, body, headers = {}, retries = 1) {
    let resp = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            resp = await http.post(url, body, headers);
            checkCloudflareChallenge(resp);
            if (resp && resp.status === 200) {
                return resp;
            }
            if (resp && resp.status < 500 && resp.status !== 429) {
                return resp;
            }
        } catch (e) {
            if (e.message && e.message.includes("security check required")) {
                throw e;
            }
            if (attempt === retries) throw e;
        }
    }
    return resp;
}

/**
 * Checks if a paragraph is reader watermark / promotional artifact.
 * @param {string} text
 * @returns {boolean}
 */
function isWatermark(text) {
    if (!text || typeof text !== "string") return true;
    const lower = text.toLowerCase();
    if (lower.includes("visit and read more novel to help us update chapter quickly")) return true;
    if (lower.includes("if you find any errors") && (lower.includes("broken links") || lower.includes("non-standard content"))) return true;
    if (lower.includes("thank you so much!") && lower.includes("help us update chapter")) return true;
    if (lower.includes("visit novellive.app") || lower.includes("visit noveltrust.com")) return true;
    if (lower.includes("read more novel to help us update chapter")) return true;
    return false;
}

const source = {
    /**
     * Search novels matching a query string.
     * @param {string} query - Search keyword.
     * @param {number} [page=1] - 1-based page index.
     * @returns {Promise<Array<{ title: string, link: string, imgSrc: string }>>}
     */
    async searchNovels(query, page = 1) {
        if (!query || !query.trim()) return [];

        const trimmed = query.trim();
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const searchUrl = p > 1
            ? `https://noveltrust.com/search/?page=${p}`
            : "https://noveltrust.com/search/";
        const payload = `searchkey=${encodeURIComponent(trimmed)}`;

        let resp = await postWithRetry(searchUrl, payload, {
            "Content-Type": "application/x-www-form-urlencoded"
        });

        if (!resp || resp.status !== 200 || !resp.body) {
            return [];
        }

        const $ = parseHtml(resp.body);
        const results = [];
        const seenLinks = new Set();

        const rows = $(".ul-list1 .li, .ul-list1-2 .li, .li-row .li, .ul-list1 li");
        for (const row of rows) {
            const titleA = row.first(".txt h3.tit a, .tit a, h3.tit a, a.tit");
            if (!titleA) continue;

            const href = titleA.attr("href");
            if (!href) continue;

            const link = normalizeNovelUrl(href) || toAbsoluteUrl(href);
            if (!link || seenLinks.has(link)) continue;

            let title = decodeHtmlEntities(titleA.attr("title")?.trim() || titleA.text().trim());
            if (!title) continue;

            const imgE = row.first(".pic img, picture img, img");
            let imgSrc = "";
            if (imgE) {
                const dataSrc = (imgE.attr("data-src") || imgE.attr("data-original") || "").trim();
                const src = (imgE.attr("src") || "").trim();
                if (dataSrc && !dataSrc.startsWith("data:") && !dataSrc.includes("placeholder")) {
                    imgSrc = toAbsoluteUrl(dataSrc);
                } else if (src && !src.startsWith("data:") && !src.includes("placeholder")) {
                    imgSrc = toAbsoluteUrl(src);
                } else if (dataSrc) {
                    imgSrc = toAbsoluteUrl(dataSrc);
                } else if (src) {
                    imgSrc = toAbsoluteUrl(src);
                }
            }

            seenLinks.add(link);
            results.push({ title, link, imgSrc });
        }

        // Direct selector fallback if container didn't match rows
        if (results.length === 0) {
            const titleLinks = $(".txt h3.tit a, h3.tit a, a[href*='/book/']");
            for (const titleA of titleLinks) {
                const href = titleA.attr("href");
                if (!href) continue;

                const link = normalizeNovelUrl(href) || toAbsoluteUrl(href);
                if (!link || seenLinks.has(link)) continue;

                let title = decodeHtmlEntities(titleA.attr("title")?.trim() || titleA.text().trim());
                if (!title) continue;

                seenLinks.add(link);
                results.push({ title, link, imgSrc: "" });
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
        if (!novelUrl || typeof novelUrl !== "string" || !novelUrl.trim() || novelUrl.trim() === "#") {
            throw new Error("novelUrl is required");
        }

        const cleanUrl = normalizeNovelUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }

        let resp = await fetchWithRetry(cleanUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        let title = $(".m-desc h1.tit, h1.tit, .m-imgtxt .tit, h1").first()?.text().trim() || "";
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle
                .replace(/\s*Novel\s*\|\s*NovelTrust.*$/i, "")
                .replace(/\s*-\s*NovelTrust.*$/i, "")
                .replace(/\s*online free.*$/i, "")
                .replace(/^Read\s+/i, "")
                .trim();
        }
        title = decodeHtmlEntities(title);

        // Author
        let author = "";
        const authorA = $(".m-imgtxt .txt .item:has(.glyphicon-user) .right a.a1, .item:has(.glyphicon-user) .right a, .item a[href*='/author/'], a[href*='/author/']").first();
        if (authorA) {
            author = decodeHtmlEntities(authorA.text().trim());
        }
        if (!author) {
            const authorItem = $(".item:has(.glyphicon-user) .right, .item:has(.glyphicon-user)").first();
            if (authorItem) {
                author = authorItem.text().replace(/^Author:\s*/i, "").trim();
                author = decodeHtmlEntities(author);
            }
        }
        if (!author) {
            const metaAuthor = $("meta[property='og:novel:author']").attr("content") || $("meta[name='author']").attr("content") || "";
            if (metaAuthor) author = decodeHtmlEntities(metaAuthor.trim());
        }

        // Cover Image
        let imageUrl = "";
        const coverImg = $(".m-imgtxt .pic img, .pic img, .m-book1 .pic img").first();
        if (coverImg) {
            const dataSrc = (coverImg.attr("data-src") || coverImg.attr("data-original") || "").trim();
            const src = (coverImg.attr("src") || "").trim();
            if (dataSrc && !dataSrc.startsWith("data:") && !dataSrc.includes("placeholder")) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src && !src.startsWith("data:") && !src.includes("placeholder")) {
                imageUrl = toAbsoluteUrl(src);
            } else if (dataSrc) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src) {
                imageUrl = toAbsoluteUrl(src);
            }
        }
        if (!imageUrl) {
            const metaImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || $("meta[name='twitter:image']").attr("content") || "";
            if (metaImg) imageUrl = toAbsoluteUrl(metaImg);
        }

        // Description
        let description = "";
        const descEl = $(".m-desc .txt .inner, .m-desc .inner, .m-desc .txt").first();
        if (descEl) {
            descEl.remove("script, style, iframe, .ads, .ad, noscript");
            const pElements = descEl.select("p");
            if (pElements.length > 0) {
                const pTexts = [];
                for (const p of pElements) {
                    const html = p.html();
                    let t;
                    if (html && /<br\s*[\/]?>/i.test(html)) {
                        t = html.replace(/<br\s*[\/]?>\s*/gi, "\n").replace(/<[^>]+>/g, "").trim();
                    } else {
                        t = p.text().trim();
                    }
                    t = decodeHtmlEntities(t).trim();
                    if (t.length > 0) pTexts.push(t);
                }
                description = pTexts.join("\n\n");
            }
            if (!description) {
                const rawHtml = descEl.html();
                if (rawHtml) {
                    description = decodeHtmlEntities(
                        rawHtml.replace(/<br\s*[\/]?>\s*/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim()
                    );
                } else {
                    description = decodeHtmlEntities(descEl.text().trim());
                }
            }
        }
        if (!description) {
            const metaDesc = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
            if (metaDesc) {
                let cleanDesc = metaDesc.replace(/^Read\s+.*?\s+online\s+for\s+free\.\s*/i, "").trim();
                description = decodeHtmlEntities(cleanDesc);
            }
        }

        // Status
        let status = "";
        const statusEl = $(".m-imgtxt .txt .item:has(.glyphicon-time) .right, .item:has(.glyphicon-time) .right, .item:has(.glyphicon-time)").first();
        if (statusEl) {
            status = statusEl.text().replace(/^Status:\s*/i, "").trim();
        }
        if (!status) {
            const metaStatus = $("meta[property='og:novel:status']").attr("content")?.trim() || "";
            if (metaStatus) status = metaStatus;
        }
        if (!status) {
            const statusA = $("a[href*='/sort/latest-release'], a[href*='/sort/completed-novel'], a[href*='/sort/completed']").first();
            if (statusA) status = statusA.text().trim();
        }
        if (/completed/i.test(status)) {
            status = "Completed";
        } else if (/ongoing/i.test(status)) {
            status = "Ongoing";
        } else if (!status) {
            status = "Ongoing";
        }

        // Genres
        const genreLinks = $(".m-imgtxt .txt .item:has(.glyphicon-th-list) .right a.a1, .item:has(.glyphicon-th-list) .right a, a[href*='/genre/']");
        const genreList = [];
        for (const g of genreLinks) {
            const text = decodeHtmlEntities(g.text().trim());
            if (text && !genreList.includes(text)) {
                genreList.push(text);
            }
        }
        let genres = genreList.join(", ");
        if (!genres) {
            const metaGenres = $("meta[property='og:novel:genre']").attr("content") || "";
            if (metaGenres) {
                genres = metaGenres.split(",").map(g => decodeHtmlEntities(g.trim())).filter(Boolean).join(", ");
            }
        }

        // Tags
        const tagLinks = $(".m-imgtxt .txt .item:has(.glyphicon-tasks) .right .s1, .item:has(.glyphicon-tasks) .right a, a[href*='/tag/']");
        const tagList = [];
        for (const t of tagLinks) {
            const text = decodeHtmlEntities(t.text().trim());
            if (text && !tagList.includes(text)) {
                tagList.push(text);
            }
        }
        const tags = tagList.join(", ");

        // Chapter List Extraction
        const chapters = [];
        const seenChapterLinks = new Set();
        const slug = extractSlug(cleanUrl);
        const normCleanUrl = cleanUrl.replace(/\/+$/, "");

        function addChapter(href, rawTitle) {
            if (!href) return;
            let link = "";
            if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
                link = toAbsoluteUrl(href);
            } else {
                const trimmedHref = href.trim();
                if (trimmedHref.startsWith("/")) {
                    link = `https://noveltrust.com${trimmedHref}`;
                } else if (trimmedHref.includes("/book/")) {
                    link = `https://noveltrust.com/${trimmedHref}`;
                } else if (slug && !trimmedHref.includes("/")) {
                    link = `https://noveltrust.com/book/${slug}/${trimmedHref}`;
                } else {
                    link = `https://noveltrust.com/book/${slug}/${trimmedHref.replace(/^\/+/, "")}`;
                }
                link = toAbsoluteUrl(link);
            }

            if (!link || seenChapterLinks.has(link)) return;

            const normLink = link.replace(/\/+$/, "");
            if (normLink === normCleanUrl) return; // Discard overview page circular link

            let chTitle = decodeHtmlEntities((rawTitle != null ? String(rawTitle) : "").trim());
            if (!chTitle) {
                const match = link.match(/\/book\/[^/?#]+\/([^/?#]+)/i) || link.match(/\/chapter[-_]?([^/?#]+)/i);
                chTitle = match ? `Chapter ${match[1].replace(/[-_]/g, " ")}` : "Chapter";
            }

            seenChapterLinks.add(link);
            chapters.push({
                title: chTitle,
                link,
                text: ""
            });
        }

        function parseChaptersFromHtml(html) {
            if (!html) return;
            const $frag = parseHtml(html);
            const links = $frag("li a, a[href*='/chapter-'], a.con");
            for (const a of links) {
                const href = a.attr("href");
                const chTitle = a.attr("title") || a.text();
                addChapter(href, chTitle);
            }
        }

        // Primary: Chapters AJAX endpoint
        if (slug) {
            try {
                const ajaxUrl = `https://noveltrust.com/ajax/get-list-chapter?novel_id=${encodeURIComponent(slug)}`;
                const ajaxResp = await fetchWithRetry(ajaxUrl);
                if (ajaxResp && ajaxResp.status === 200 && ajaxResp.body) {
                    let data = null;
                    try {
                        data = JSON.parse(ajaxResp.body);
                    } catch (_) {}

                    if (data) {
                        let list = [];
                        if (Array.isArray(data)) {
                            list = data;
                        } else if (Array.isArray(data.data)) {
                            list = data.data;
                        } else if (Array.isArray(data.chapters)) {
                            list = data.chapters;
                        } else if (Array.isArray(data.result)) {
                            list = data.result;
                        } else if (Array.isArray(data.list)) {
                            list = data.list;
                        } else if (typeof (data.html || data.content || data.body) === "string") {
                            parseChaptersFromHtml(data.html || data.content || data.body);
                        }

                        if (list.length === 0 && data && typeof data === "object") {
                            const values = Object.values(data);
                            if (values.length > 0 && typeof values[0] === "object" && values[0] !== null &&
                                (values[0].title != null || values[0].chapter_id != null || values[0].link || values[0].name)) {
                                list = values;
                            }
                        }

                        for (const item of list) {
                            if (!item) continue;
                            let rawTitle = item.title != null ? item.title : (item.chapter_name || item.chapter_title || item.name || item.tit || "");
                            let rawHref = item.link || item.url || item.href || item.chapter_link || item.chapter_url || "";
                            if (!rawHref) {
                                const chId = item.chapter_id != null ? String(item.chapter_id) :
                                    (item.id != null ? String(item.id) :
                                    (item.chapter_slug || item.slug || item.chapterId || ""));
                                if (chId) {
                                    rawHref = `/book/${slug}/${chId}`;
                                }
                            }
                            if (rawHref) {
                                addChapter(rawHref, rawTitle);
                            }
                        }
                    } else if (typeof ajaxResp.body === "string" && ajaxResp.body.includes("<")) {
                        parseChaptersFromHtml(ajaxResp.body);
                    }
                }
            } catch (e) {
                if (e.message && e.message.includes("security check required")) {
                    throw e;
                }
                console.warn("AJAX get-list-chapter failed: " + e.message);
            }
        }

        // Fallback: Overview page static DOM fallback
        if (chapters.length === 0) {
            const domLinks = $(".m-newest2 ul.ul-list5 li a.con, .m-newest2 ul.ul-list5 li a, .ul-list5 li a.con, .ul-list5 li a, a[href*='/chapter-']");
            for (const a of domLinks) {
                const href = a.attr("href");
                const chTitle = a.attr("title") || a.text();
                addChapter(href, chTitle);
            }
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
        if (!chapterUrl || typeof chapterUrl !== "string" || !chapterUrl.trim() ||
            chapterUrl.trim() === "#" || chapterUrl.trim().startsWith("javascript:")) {
            return "";
        }

        const cleanUrl = toAbsoluteUrl(chapterUrl.trim());
        if (!cleanUrl) return "";

        let resp = await fetchWithRetry(cleanUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);
        const content = $(".m-read .txt, .m-read, #article, .chapter-content").first() || $(".txt").first();
        let paragraphs = "";

        if (content) {
            // Strip ads, navigation, headings, styles, scripts
            content.remove("h4, div[id^='pf-'], div[id^='bg-ssp-'], div[class*='pubfuture'], div[id*='pubfuture'], div.ad, div.ads, ins, iframe, script, style, noscript, .chapternav, .read-ads, .reader-ad-skip");

            const pElements = content.select("p");
            if (pElements.length > 0) {
                const pTexts = [];
                for (const p of pElements) {
                    p.remove("script, style, iframe, ins, .reader-ad-skip, [id^='pf-'], [id^='bg-ssp-'], [class*='pubfuture'], [id*='pubfuture']");
                    const html = p.html();
                    if (html && /<br\s*[\/]?>/i.test(html)) {
                        const lines = html
                            .replace(/\s*<br\s*[\/]?>\s*/gi, "\n")
                            .replace(/<[^>]+>/g, "")
                            .split(/\n+/);
                        for (const line of lines) {
                            const cleanLine = decodeHtmlEntities(line).trim();
                            if (cleanLine.length > 0 && !isWatermark(cleanLine)) {
                                pTexts.push(cleanLine);
                            }
                        }
                    } else {
                        const t = decodeHtmlEntities(p.text().trim());
                        if (t.length > 0 && !isWatermark(t)) {
                            pTexts.push(t);
                        }
                    }
                }
                paragraphs = pTexts.map(p => `<p>${p}</p>`).join("");
            }

            // Fallback if no <p> tags found or all empty
            if (!paragraphs) {
                const rawHtml = content.html();
                if (rawHtml) {
                    const withNewlines = rawHtml
                        .replace(/\s*<br\s*[\/]?>\s*/gi, "\n\n")
                        .replace(/<\/p>/gi, "\n\n")
                        .replace(/<[^>]+>/g, "");
                    paragraphs = withNewlines
                        .split(/\n+/)
                        .map(p => decodeHtmlEntities(p.trim()))
                        .filter(t => t.length > 0 && !isWatermark(t))
                        .join("\n\n");
                } else {
                    paragraphs = decodeHtmlEntities(content.text().trim());
                }
            }
        }

        return paragraphs;
    }
};
