/**
 * Source script for novelfire.net
 */

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
            /* convert number html code entities */
            try {
                const code = parseInt(dec, 10);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            /* convert hex html code entities */
            try {
                const code = parseInt(hex, 16);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        });
}

/**
 * Normalizes a novel overview URL by stripping query strings, hash fragments,
 * and /chapters sub-paths, ensuring absolute https URL.
 * @param {string} url
 * @returns {string}
 */
function normalizeNovelUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (!clean.startsWith("http")) {
        clean = `https://novelfire.net${clean.startsWith("/") ? "" : "/"}${clean}`;
    }
    clean = clean.split("?")[0].split("#")[0];
    clean = clean.replace(/\/chapters.*$/, "").replace(/\/chapter-\d+.*$/, "").replace(/\/+$/, "");
    return clean;
}

/**
 * Normalizes a chapter reading URL.
 * @param {string} url
 * @param {string} [baseNovelUrl]
 * @returns {string}
 */
function normalizeChapterUrl(url, baseNovelUrl = "") {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim().split("#")[0];
    if (clean.startsWith("//")) {
        return `https:${clean}`;
    }
    if (clean.startsWith("http")) {
        return clean;
    }
    if (clean.startsWith("/")) {
        return `https://novelfire.net${clean}`;
    }
    if (baseNovelUrl) {
        return `${baseNovelUrl}/${clean}`;
    }
    return `https://novelfire.net/${clean}`;
}

/**
 * Resolves a relative or protocol-relative URL against a base URL.
 * @param {string} relativeUrl
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveUrl(relativeUrl, baseUrl) {
    if (!relativeUrl || typeof relativeUrl !== "string") return "";
    let clean = relativeUrl.trim();
    if (clean.startsWith("//")) {
        return `https:${clean}`;
    }
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
        return clean;
    }
    if (baseUrl) {
        const originMatch = baseUrl.match(/^(https?:\/\/[^\/]+)/i);
        const origin = originMatch ? originMatch[1] : "";
        if (clean.startsWith("/")) {
            return `${origin}${clean}`;
        }
        const basePath = baseUrl.replace(/\/[^\/]*$/, "/");
        return `${basePath}${clean}`;
    }
    return clean;
}

/**
 * Extracts a client-side redirect URL (window.location, location.replace, meta refresh) from HTML.
 * @param {string} html
 * @param {string} [baseUrl]
 * @returns {string|null}
 */
function extractRedirectUrl(html, baseUrl = "") {
    if (!html || typeof html !== "string") return null;

    // 1. Check window.location.href / window.location / location.href / location.replace
    const jsMatch = html.match(/(?:window\.)?location(?:\.href|\.replace)?\s*(?:=|\()\s*["']([^"']+)["']/i);
    if (jsMatch && jsMatch[1]) {
        let target = jsMatch[1].replace(/\\\//g, "/").replace(/\\(['"])/g, "$1").trim();
        return resolveUrl(target, baseUrl);
    }

    // 2. Check <meta http-equiv="refresh" content="0;url=...">
    const metaMatch = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?[0-9]+;\s*url=([^"'>\s]+)["']?/i);
    if (metaMatch && metaMatch[1]) {
        let target = metaMatch[1].replace(/\\\//g, "/").replace(/\\(['"])/g, "$1").trim();
        return resolveUrl(target, baseUrl);
    }

    return null;
}

/**
 * Safe HTTP GET with client-side redirect following.
 * Note: Retry on 429 with backoff is handled natively in HttpBridge.
 * @param {string} url
 * @param {number} maxHops
 * @returns {Promise<any>}
 */
async function fetchWithRedirect(url, maxHops = 3) {
    let currentUrl = url;
    let prevUrl = "";
    let resp = null;

    for (let hop = 0; hop <= maxHops; hop++) {
        const headers = prevUrl ? { "Referer": prevUrl } : {};
        resp = await http.get(currentUrl, headers);

        if (resp && resp.status === 200 && resp.body) {
            const redirectUrl = extractRedirectUrl(resp.body, currentUrl);
            if (redirectUrl && redirectUrl !== currentUrl) {
                prevUrl = currentUrl;
                currentUrl = redirectUrl;
                continue;
            }
        }
        break;
    }

    return resp;
}

/**
 * Safe HTTP GET with retry on 429 or server errors.
 * @param {string} url
 * @param {number} retries
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url, retries = 1) {
    let resp = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            resp = await http.get(url);
            if (resp && resp.status === 200) {
                return resp;
            }
            if (resp && resp.status < 500 && resp.status !== 429) {
                return resp;
            }
        } catch (e) {
            if (attempt === retries) throw e;
        }
    }
    return resp;
}

const source = {
    /**
     * Search novels matching a query string using standard paginated search page.
     * Note: Ignore searchLive endpoint as it only shows 5 search results.
     * @param {string} query - Search keyword.
     * @param {number} page - 1-based page index.
     * @returns {Promise<Array<{ title: string, link: string, imgSrc: string }>>}
     */
    async searchNovels(query, page = 1) {
        if (!query || typeof query !== "string" && typeof query !== "number" || !String(query).trim()) {
            return [];
        }

        const trimmed = String(query).trim();
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const searchUrl = `https://novelfire.net/search?keyword=${encodeURIComponent(trimmed)}&type=title&page=${pageNum}`;

        const resp = await fetchWithRetry(searchUrl);
        const results = [];
        const seenLinks = new Set();

        if (resp && resp.status === 200 && resp.body) {
            const $ = parseHtml(resp.body);

            // Remove recommendation sections that appear when no results or below results
            $("section.popular-novels, .popular-novels, section.related").remove();

            const headerText = $("article#latest-updates header h1, header#header h1, h1").text();
            if (/with 0 results|0 results found|no results/i.test(headerText)) {
                return [];
            }

            const items = $("ul.novel-list > li.novel-item, li.novel-item");

            for (const item of items) {
                const a = item.first("a[href*='/book/']") || item.first("a");
                if (!a) continue;

                let href = a.attr("href");
                if (!href) continue;

                let link = href.trim();
                if (link.startsWith("//")) {
                    link = `https:${link}`;
                } else if (!link.startsWith("http")) {
                    link = `https://novelfire.net${link.startsWith("/") ? "" : "/"}${link}`;
                }

                if (!link.includes("/book/")) continue;
                if (seenLinks.has(link)) continue;

                const titleEl = item.first("h4.novel-title, .novel-title");
                let title = titleEl ? titleEl.text().trim() : "";
                if (!title) {
                    title = a.attr("title")?.trim() || a.text().trim();
                }
                title = decodeHtmlEntities(title);

                const img = item.first("figure.novel-cover img, .novel-cover img, img");
                let imgSrc = "";
                if (img) {
                    const dataSrc = img.attr("data-src")?.trim();
                    const src = img.attr("src")?.trim();
                    imgSrc = (dataSrc && !dataSrc.startsWith("data:")) ? dataSrc : (src && !src.startsWith("data:") ? src : (dataSrc || src || ""));
                }
                if (imgSrc) {
                    if (imgSrc.startsWith("//")) {
                        imgSrc = `https:${imgSrc}`;
                    } else if (!imgSrc.startsWith("http")) {
                        imgSrc = `https://novelfire.net${imgSrc.startsWith("/") ? "" : "/"}${imgSrc}`;
                    }
                }

                if (title && link) {
                    seenLinks.add(link);
                    results.push({ title, link, imgSrc });
                }
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
        if (!novelUrl || typeof novelUrl !== "string" || !novelUrl.trim()) {
            throw new Error("novelUrl is required");
        }

        const cleanUrl = normalizeNovelUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl provided");
        }

        const resp = await fetchWithRetry(cleanUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        let title = $("h1.novel-title, h1[itemprop='name'], h1").first()?.text().trim() || "";
        title = decodeHtmlEntities(title);

        // Author
        let authorEl = $(".author [itemprop='author'], .author a.property-item, .author a").first() || $(".author").first();
        let author = authorEl ? authorEl.text().trim() : "";
        author = author.replace(/^Author:\s*/i, "").trim();
        if (!author) {
            author = $("meta[name='author'], meta[property='book:author']").attr("content")?.trim() || "";
        }
        author = decodeHtmlEntities(author);

        // Cover Image
        const coverImg = $("figure.novel-cover img, .novel-cover img, figure.cover img, .cover img, .fixed-img img").first();
        let imageUrl = "";
        if (coverImg) {
            const dataSrc = coverImg.attr("data-src")?.trim();
            const src = coverImg.attr("src")?.trim();
            imageUrl = (dataSrc && !dataSrc.startsWith("data:")) ? dataSrc : (src && !src.startsWith("data:") ? src : (dataSrc || src || ""));
        }
        if (!imageUrl) {
            imageUrl = $("meta[property='og:image']").attr("content")?.trim() || "";
        }
        if (imageUrl) {
            if (imageUrl.startsWith("//")) {
                imageUrl = `https:${imageUrl}`;
            } else if (!imageUrl.startsWith("http")) {
                imageUrl = `https://novelfire.net${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
            }
        }

        // Description
        const summaryEl = $(".summary .content, .summary").first();
        let description = "";
        if (summaryEl) {
            summaryEl.remove(".expand, .expand-btn");
            const pList = summaryEl.select("p");
            if (pList.length > 0) {
                description = pList.map(p => p.text().trim()).filter(Boolean).join("\n\n");
            } else {
                description = summaryEl.text().trim();
            }
        }
        if (!description) {
            description = $("meta[property='og:description'], meta[name='description']").attr("content")?.trim() || "";
        }
        description = decodeHtmlEntities(description)
            .replace(/^Summary\s*/i, "")
            .replace(/Show More$/i, "")
            .trim();

        // Genres
        const genreElements = $(".categories ul li a, .categories a.property-item, .categories a");
        const genres = genreElements
            .map(el => decodeHtmlEntities(el.text().trim()))
            .filter(Boolean)
            .filter((val, idx, arr) => arr.indexOf(val) === idx)
            .join(", ");

        // Tags
        const tagElements = $(".tags ul.content li a.tag, .tags a.tag, a[rel='tag'], .tags a");
        let tags = tagElements
            .map(el => decodeHtmlEntities(el.text().trim()))
            .filter(Boolean)
            .filter((val, idx, arr) => arr.indexOf(val) === idx)
            .join(", ");
        if (!tags) {
            const metaKeywords = $("meta[itemprop='keywords'], meta[name='keywords']").attr("content");
            if (metaKeywords) {
                tags = metaKeywords
                    .split(",")
                    .map(t => decodeHtmlEntities(t.trim()))
                    .filter(t => t && !/^(Novel|Webnovel)$/i.test(t))
                    .join(", ");
            }
        }

        // Status
        let status = "";
        if ($(".header-stats strong.ongoing, strong.ongoing, .novel-stats strong.ongoing").length > 0) {
            status = "Ongoing";
        } else if ($(".header-stats strong.completed, strong.completed, .novel-stats strong.completed").length > 0) {
            status = "Completed";
        } else {
            const statsText = $(".header-stats, .novel-stats").text();
            if (/completed/i.test(statsText)) {
                status = "Completed";
            } else if (/ongoing/i.test(statsText)) {
                status = "Ongoing";
            }
        }

        // Chapters list
        const chapters = [];
        const seenChapterLinks = new Set();
        const firstPageUrl = `${cleanUrl}/chapters?page=1`;

        function extractChaptersFromDoc(doc) {
            const list = [];
            const links = doc("ul.chapter-list li a, .chapter-list a, .list-chapter a");
            for (const a of links) {
                let href = a.attr("href");
                if (!href || !href.includes("/chapter-")) continue;

                let link = normalizeChapterUrl(href, cleanUrl);
                if (seenChapterLinks.has(link)) continue;
                seenChapterLinks.add(link);

                let chTitle = a.first(".chapter-title")?.text().trim() || "";
                if (!chTitle) {
                    chTitle = a.attr("title")?.trim() || "";
                }
                if (!chTitle) {
                    const chNo = a.first(".chapter-no")?.text().trim() || "";
                    const timeEl = a.first(".chapter-update, time");
                    const timeText = timeEl ? timeEl.text().trim() : "";
                    let fullText = a.text().trim();
                    if (timeText && fullText.endsWith(timeText)) {
                        fullText = fullText.slice(0, -timeText.length).trim();
                    }
                    if (chNo && !fullText.toLowerCase().includes("chapter")) {
                        const rest = fullText.replace(new RegExp(`^${chNo}\\s*`), "").trim();
                        chTitle = rest ? `Chapter ${chNo}: ${rest}` : `Chapter ${chNo}`;
                    } else {
                        chTitle = fullText;
                    }
                }
                chTitle = decodeHtmlEntities(chTitle);

                list.push({
                    title: chTitle,
                    link: link,
                    text: ""
                });
            }
            return list;
        }

        let chaptersResp = null;
        try {
            chaptersResp = await fetchWithRetry(firstPageUrl);
        } catch (e) {
            console.warn(`Failed to fetch first chapter page ${firstPageUrl}: ` + e.message);
        }

        if (chaptersResp && chaptersResp.status === 200 && chaptersResp.body) {
            const $ch = parseHtml(chaptersResp.body);
            chapters.push(...extractChaptersFromDoc($ch));

            // Pagination discovery: inspect ul.pagination li.page-item a for other page URLs (?page=\d+)
            const pageLinks = $ch("ul.pagination li.page-item a, .pagination a");
            let maxPage = 1;
            for (const a of pageLinks) {
                const val = a.attr("href") || "";
                const pageMatch = val.match(/[?&]page=(\d+)/);
                if (pageMatch) {
                    const pageNum = parseInt(pageMatch[1], 10);
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            }

            const maxChapAttr = $ch("#gotochapno, input[name='chapno']").attr("max");
            if (maxChapAttr) {
                const totalChaps = parseInt(maxChapAttr, 10);
                if (totalChaps > 0) {
                    const calcMaxPage = Math.ceil(totalChaps / 100);
                    if (calcMaxPage > maxPage) {
                        maxPage = calcMaxPage;
                    }
                }
            }

            const otherPageUrls = [];
            if (maxPage > 1) {
                for (let p = 2; p <= maxPage; p++) {
                    otherPageUrls.push(`${cleanUrl}/chapters?page=${p}`);
                }
            }

            if (otherPageUrls.length > 0) {
                const chunkSize = 3;
                for (let i = 0; i < otherPageUrls.length; i += chunkSize) {
                    const chunk = otherPageUrls.slice(i, i + chunkSize);
                    try {
                        const responses = await Promise.all(
                            chunk.map(async (u) => {
                                try {
                                    return await fetchWithRetry(u, 1);
                                } catch (e) {
                                    console.warn(`Error fetching chapter page ${u}: ` + e.message);
                                    return null;
                                }
                            })
                        );
                        for (const chResp of responses) {
                            if (chResp && chResp.status === 200 && chResp.body) {
                                const $other = parseHtml(chResp.body);
                                chapters.push(...extractChaptersFromDoc($other));
                            }
                        }
                    } catch (e) {
                        console.warn("Error fetching chunk of chapter pages: " + e.message);
                    }
                }
            }
        }

        // Fallback: if no chapters found via /chapters?page=1, check on overview page
        if (chapters.length === 0) {
            chapters.push(...extractChaptersFromDoc($));
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
        if (!chapterUrl || typeof chapterUrl !== "string" || !chapterUrl.trim() || chapterUrl.trim() === "#") {
            return "";
        }

        /* Network request with client-side redirect following (retry on 429 handled in HttpBridge) */
        const resp = await fetchWithRedirect(chapterUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        /* DOM parsing*/
        const $ = parseHtml(resp.body);
        const container = $("#chapter-container, .chapter-content, #chr-content, #content, .reading-content").first();
        if (!container) {
            throw new Error(`Failed to load chapter container`);
        }

        /* Paragraph selection*/
        const pElements = container.select("p");
        if (pElements.length > 0) {
            const paragraphs = pElements.map(p => decodeHtmlEntities(p.text().trim()))
                .filter(text => text.length > 0)
                .filter(text => !/If you find any errors|report chapter/i.test(text))
                .map(p => `<p>${p}</p>`)
                .join("");
            
            return paragraphs;
        }
        throw new Error(`Failed to load chapter paragraphs`);
    }
};
