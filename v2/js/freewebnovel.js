/**
 * Source script for freewebnovel.com
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
            //convert number html code entities
            try {
                const code = parseInt(dec, 10);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            //convert hex html code entities
            try {
                const code = parseInt(hex, 16);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        });
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
    } else if (clean.startsWith("freewebnovel.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://freewebnovel.com${clean.startsWith("/") ? "" : "/"}${clean}`;
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
 * Extracts novel slug identifier from a URL or raw slug string.
 * @param {string} url
 * @returns {string}
 */
function extractSlug(url) {
    if (!url || typeof url !== "string") return "";
    const clean = url.trim().split("?")[0].split("#")[0];
    const match = clean.match(/\/novel\/([^/?#]+)/i);
    if (match) return match[1].trim();
    if (!clean.includes("/") && !clean.includes(":") && clean.length > 0) {
        return clean;
    }
    return "";
}

/**
 * Normalizes a novel overview URL by ensuring base path https://freewebnovel.com/novel/{slug}.
 * Returns empty string if the URL does not correspond to a valid novel path or slug.
 * @param {string} url
 * @returns {string}
 */
function normalizeNovelUrl(url) {
    if (!url || typeof url !== "string") return "";
    const directSlug = extractSlug(url);
    if (directSlug) {
        return `https://freewebnovel.com/novel/${directSlug}`;
    }
    let clean = toAbsoluteUrl(url);
    if (!clean) return "";
    clean = clean.split("?")[0].split("#")[0];
    const slug = extractSlug(clean);
    if (slug) {
        return `https://freewebnovel.com/novel/${slug}`;
    }
    return "";
}

/**
 * Checks for Cloudflare challenge pages and throws a descriptive error.
 * @param {object} resp
 */
function checkCloudflareChallenge(resp) {
    if (resp && resp.body) {
        const isChallenge = (resp.status === 403 || resp.status === 503) ||
            resp.body.includes("Just a moment...") ||
            resp.body.includes("challenge-running") ||
            (resp.body.includes("cf-turnstile") && !resp.body.includes("<div class=\"tit\">"));
        if (isChallenge && (resp.status === 403 || resp.status === 503 || resp.body.includes("Cloudflare") || resp.body.includes("cloudflare"))) {
            throw new Error("FreeWebNovel security check required: Cloudflare challenge triggered.");
        }
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
        const p = Math.max(1, parseInt(page, 10) || 1);
        const searchUrl = p > 1
            ? `https://freewebnovel.com/search?keyword=${encodeURIComponent(trimmed)}&page=${p}`
            : `https://freewebnovel.com/search?keyword=${encodeURIComponent(trimmed)}`;

        let resp = await fetchWithRetry(searchUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            return [];
        }

        const $ = parseHtml(resp.body);
        const results = [];
        const seenLinks = new Set();

        const rows = $(".ul-list1 .li, .rank-list .li, .li-row .li, .con:has(.tit)");
        for (const row of rows) {
            const titleA = row.first(".tit a, h3.tit a, a.tit");
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

            if (!imgSrc) {
                const sourceE = row.first(".pic picture source, picture source, source");
                if (sourceE) {
                    const srcset = sourceE.attr("srcset") || "";
                    if (srcset) {
                        const firstSrc = srcset.split(",")[0].trim().split(" ")[0].trim();
                        if (firstSrc) imgSrc = toAbsoluteUrl(firstSrc);
                    }
                }
            }

            seenLinks.add(link);
            results.push({ title, link, imgSrc });
        }

        // Direct selector fallback if container didn't match rows
        if (results.length === 0) {
            const titleLinks = $(".tit a, h3 a[href*='/novel/']");
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

        // Attempt JSON-LD extraction
        let jsonLdBook = null;
        try {
            const jsonLdScripts = $("script[type='application/ld+json']");
            for (const s of jsonLdScripts) {
                const content = s.text();
                if (content && content.includes('"Book"')) {
                    const parsed = JSON.parse(content);
                    if (parsed && (parsed['@type'] === 'Book' || parsed.name)) {
                        jsonLdBook = parsed;
                        break;
                    }
                }
            }
            if (!jsonLdBook) {
                const matches = resp.body.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
                if (matches) {
                    for (const m of matches) {
                        const jsonText = m.replace(/<script\b[^>]*>/i, "").replace(/<\/script>/i, "").trim();
                        if (jsonText.includes('"Book"')) {
                            const parsed = JSON.parse(jsonText);
                            if (parsed && (parsed['@type'] === 'Book' || parsed.name)) {
                                jsonLdBook = parsed;
                                break;
                            }
                        }
                    }
                }
            }
        } catch (_) {}

        // Title
        let title = $("h1.tit, .m-imgtxt .tit, h1").first()?.text().trim() || "";
        if (!title && jsonLdBook && jsonLdBook.name) {
            title = jsonLdBook.name;
        }
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle
                .replace(/\s*Novel\s*\|\s*Free Web Novel.*$/i, "")
                .replace(/\s*-\s*Free Web Novel.*$/i, "")
                .trim();
        }
        title = decodeHtmlEntities(title);

        // Author
        let author = "";
        const authorA = $(".m-imgtxt a[href*='/author/'], .right a[href*='/author/'], a[href*='/author/']").first();
        if (authorA) {
            author = decodeHtmlEntities(authorA.text().trim());
        }
        if (!author && jsonLdBook && jsonLdBook.author) {
            if (Array.isArray(jsonLdBook.author)) {
                author = jsonLdBook.author.map(a => typeof a === 'object' ? a.name : a).filter(Boolean).join(", ");
            } else if (typeof jsonLdBook.author === 'object') {
                author = jsonLdBook.author.name || "";
            } else if (typeof jsonLdBook.author === 'string') {
                author = jsonLdBook.author;
            }
        }
        if (!author) {
            const metaAuthor = $("meta[property='og:novel:author']").attr("content") || $("meta[name='author']").attr("content") || "";
            if (metaAuthor) author = decodeHtmlEntities(metaAuthor.trim());
        }

        // Cover Image
        let imageUrl = "";
        const coverImg = $(".m-book1 .pic img, .m-imgtxt .pic img, .pic img").first();
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
        if (!imageUrl && jsonLdBook && jsonLdBook.image) {
            imageUrl = toAbsoluteUrl(typeof jsonLdBook.image === 'string' ? jsonLdBook.image : (jsonLdBook.image.url || ""));
        }
        if (!imageUrl) {
            const metaImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || $("meta[name='twitter:image']").attr("content") || "";
            if (metaImg) imageUrl = toAbsoluteUrl(metaImg);
        }

        // Description
        let description = "";
        const descEl = $(".m-desc .txt .inner, .m-desc .inner, .m-desc .txt, .abstract + .txt .inner").first();
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
        if (!description && jsonLdBook && jsonLdBook.description) {
            description = decodeHtmlEntities(jsonLdBook.description.trim());
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
        const metaStatus = $("meta[property='og:novel:status']").attr("content")?.trim() || "";
        if (metaStatus) {
            status = metaStatus;
        }
        if (!status) {
            const timeItem = $(".glyphicon-time").first();
            if (timeItem) {
                const statusEl = $(".item:has(.glyphicon-time) .right, .right:has(a[href*='/sort/'])").first();
                if (statusEl) {
                    status = statusEl.text().trim();
                }
            }
        }
        if (!status) {
            const statusA = $("a[href*='/sort/latest-release'], a[href*='/sort/completed-novel']").first();
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
        const genreLinks = $(".m-imgtxt .txt a[href*='/genre/'], .m-book1 a[href*='/genre/'], a[href*='/genre/']");
        const genreList = [];
        for (const g of genreLinks) {
            const text = decodeHtmlEntities(g.text().trim());
            if (text && !genreList.includes(text)) {
                genreList.push(text);
            }
        }
        let genres = genreList.join(", ");
        if (!genres && jsonLdBook && jsonLdBook.genre) {
            if (Array.isArray(jsonLdBook.genre)) {
                genres = jsonLdBook.genre.map(g => decodeHtmlEntities(String(g).trim())).filter(Boolean).join(", ");
            } else if (typeof jsonLdBook.genre === 'string') {
                genres = decodeHtmlEntities(jsonLdBook.genre.trim());
            }
        }
        if (!genres) {
            const metaGenres = $("meta[property='og:novel:genre']").attr("content") || "";
            if (metaGenres) {
                genres = metaGenres.split(",").map(g => decodeHtmlEntities(g.trim())).filter(Boolean).join(", ");
            }
        }

        // Tags
        const tagLinks = $(".m-imgtxt a[href*='/tag/'], a[href*='/tag/']");
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
            const link = toAbsoluteUrl(href);
            if (!link || seenChapterLinks.has(link)) return;

            const normLink = link.replace(/\/+$/, "");
            if (normLink === normCleanUrl) return; // Discard circular link back to overview

            if (!/\/chapter[-_]/i.test(normLink) && !/\/(?:ch|c|ep|episode)[-_]?\d+/i.test(normLink)) {
                return;
            }

            let chTitle = decodeHtmlEntities((rawTitle || "").trim());
            if (!chTitle) {
                const match = link.match(/\/chapter[-_]?([^/?#]+)/i);
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
            const links = $frag("li a, a[href*='/chapter-']");
            for (const a of links) {
                const href = a.attr("href");
                const title = a.attr("title") || a.text();
                addChapter(href, title);
            }
            if (links.length === 0) {
                const aTagRegex = /<a\b([\s\S]*?)>([\s\S]*?)<\/a>/gi;
                let tagMatch;
                while ((tagMatch = aTagRegex.exec(html)) !== null) {
                    const attrs = tagMatch[1];
                    const inner = tagMatch[2];
                    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
                    if (!hrefMatch) continue;
                    const titleAttrMatch = attrs.match(/title=["']([^"']*)["']/i);
                    const title = titleAttrMatch ? titleAttrMatch[1] : inner.replace(/<[^>]+>/g, "").trim();
                    addChapter(hrefMatch[1], title);
                }
            }
        }

        // Strategy 1: Chapters AJAX endpoint
        if (slug) {
            try {
                const firstAjaxUrl = `https://freewebnovel.com/novel/${slug}?ajax=chapters&page=1&pageSize=200`;
                const firstResp = await fetchWithRetry(firstAjaxUrl, {
                    "x-requested-with": "XMLHttpRequest",
                    "accept": "application/json, text/javascript, */*; q=0.01"
                });
                if (firstResp && firstResp.status === 200 && firstResp.body) {
                    let firstData = null;
                    try {
                        firstData = JSON.parse(firstResp.body);
                    } catch (_) {}

                    if (firstData && firstData.html) {
                        parseChaptersFromHtml(firstData.html);

                        let totalPage = 1;
                        if (typeof firstData.totalPage === 'number') {
                            totalPage = firstData.totalPage;
                        } else if (firstData.totalPage) {
                            totalPage = parseInt(firstData.totalPage, 10) || 1;
                        } else if (typeof firstData.totalChapters === 'number') {
                            totalPage = Math.ceil(firstData.totalChapters / 200);
                        } else if (firstData.totalChapters) {
                            totalPage = Math.ceil((parseInt(firstData.totalChapters, 10) || 1) / 200);
                        }

                        if (totalPage > 1) {
                            const maxPage = Math.min(totalPage, 100);
                            for (let p = 2; p <= maxPage; p += 3) {
                                const chunkPromises = [];
                                for (let pageNum = p; pageNum < p + 3 && pageNum <= maxPage; pageNum++) {
                                    const pageUrl = `https://freewebnovel.com/novel/${slug}?ajax=chapters&page=${pageNum}&pageSize=200`;
                                    chunkPromises.push(
                                        fetchWithRetry(pageUrl, {
                                            "x-requested-with": "XMLHttpRequest",
                                            "accept": "application/json, text/javascript, */*; q=0.01"
                                        }).then(res => {
                                            if (res && res.status === 200 && res.body) {
                                                try {
                                                    const d = JSON.parse(res.body);
                                                    return d.html || "";
                                                } catch (_) {
                                                    return "";
                                                }
                                            }
                                            return "";
                                        }).catch(() => "")
                                    );
                                }
                                const chunkResults = await Promise.all(chunkPromises);
                                for (const html of chunkResults) {
                                    if (html) parseChaptersFromHtml(html);
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("AJAX chapter extraction failed: " + e.message);
            }
        }

        // Strategy 2: Overview page static DOM fallback (#idData li a)
        if (chapters.length === 0) {
            let staticLinks = $("#idData li a");
            if (staticLinks.length === 0) {
                staticLinks = $(".ul-list5 li a");
            }
            if (staticLinks.length === 0) {
                staticLinks = $("a[href*='/chapter-']");
            }
            for (const a of staticLinks) {
                const href = a.attr("href");
                const title = a.attr("title") || a.text();
                addChapter(href, title);
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
        if (!chapterUrl || typeof chapterUrl !== "string" || !chapterUrl.trim()) return "";
        let cleanUrl = toAbsoluteUrl(chapterUrl.trim());
        if (!cleanUrl) return "";

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);
        const container = $("#article").first() || $(".txt").first();
        if(!container) {
            throw new Error(`Failed to load chapter container`);
        }
        const pElements = container.select("p")
        if(pElements.length > 0) {
            const paragraphs = pElements.map(p => decodeHtmlEntities(p.text().trim()))
                .filter(text => text.length > 0)
                .map(p => `<p>${p}</p>`)
                .join("");
            return paragraphs
        } else {
            throw new Error(`Failed to load chapter paragraphs`);
        }
    }
};
