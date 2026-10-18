/**
 * Source script for fanmtl.com
 */
//@ts-check

/**
 * Decodes standard and numeric HTML entities.
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
 * Normalizes a URL to be absolute with https and no duplicate path slashes.
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    if (!clean || clean === "#" || clean === "https://" || clean === "http://" ||
        clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        //prepend https:
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        //replace http with https
        clean = "https://" + clean.slice(7);
    } else if (clean.startsWith("fanmtl.com") || clean.startsWith("www.fanmtl.com")) {
        //base domain prepend with https://
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://www.fanmtl.com${clean.startsWith("/") ? "" : "/"}${clean}`;
    }

    //canonicalize to https://www.
    clean = clean.replace(/^https?:\/\/fanmtl\.com(\/|$)/i, "https://www.fanmtl.com$1");

    // Deduplicate consecutive slashes only within the pathname:
    // A simple global replace(/\/+/g, "/") would break "https://" into "https:/"
    // and corrupt slashes inside query parameters or hash fragments.
    // match[1] = origin (protocol + host), match[2] = pathname, match[3] = query/hash
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
 * Formats HTML text with paragraphs and breaks into clean plain text.
 * @param {string} html
 * @returns {string}
 */
function cleanDescription(html) {
    if (!html || typeof html !== "string") return "";
    const textWithBreaks = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "");
    return decodeHtmlEntities(textWithBreaks)
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .join("\n\n");
}

/**
 * Extracts novel card results from search page document.
 * @param {Function} $
 * @param {Set<string>} seenLinks
 * @returns {Array<{ title: string, link: string, imgSrc: string }>}
 */
function parseSearchCards($, seenLinks) {
    const results = [];
    const items = $("ul.novel-list li.novel-item, li.novel-item, .novel-item");

    for (const item of items) {
        const a = item.first("a[href*='/novel/'], a");
        if (!a) continue;

        let href = a.attr("href");
        if (!href) continue;

        let link = toAbsoluteUrl(href);
        if (!link || seenLinks.has(link)) continue;

        const titleEl = item.first("h4.novel-title, .novel-title, h5.novel-title");
        let title = titleEl ? titleEl.text().trim() : "";
        if (!title) {
            title = a.attr("title")?.trim() || "";
        }
        title = decodeHtmlEntities(title).trim();
        if (!title) continue;

        const img = item.first("figure.novel-cover img, .novel-cover img, img");
        let imgSrc = "";
        if (img) {
            const dataSrc = img.attr("data-src")?.trim();
            const src = img.attr("src")?.trim();
            if (dataSrc && !dataSrc.includes("placeholder-")) {
                imgSrc = toAbsoluteUrl(dataSrc);
            } else if (src && !src.includes("placeholder-")) {
                imgSrc = toAbsoluteUrl(src);
            } else if (dataSrc) {
                imgSrc = toAbsoluteUrl(dataSrc);
            } else if (src) {
                imgSrc = toAbsoluteUrl(src);
            }
        }

        seenLinks.add(link);
        results.push({
            title,
            link,
            imgSrc
        });
    }

    return results;
}

/**
 * Extracts chapters from chapter list document.
 * @param {Function} $
 * @param {Set<string>} seenChapterLinks
 * @returns {Array<{ title: string, link: string, text: string }>}
 */
function extractChapters($, seenChapterLinks) {
    const list = [];
    const items = $("ul.chapter-list li a, .chapter-list a");
    for (const a of items) {
        let href = a.attr("href");
        if (!href) continue;
        let link = toAbsoluteUrl(href);
        if (!link || seenChapterLinks.has(link)) continue;
        seenChapterLinks.add(link);

        let chTitle = a.first("strong.chapter-title, .chapter-title")?.text()?.trim() ||
                      a.attr("title")?.trim();
        if (!chTitle) {
            const timeEl = a.first("time");
            const timeText = timeEl ? timeEl.text() : "";
            chTitle = a.text().replace(timeText, "").trim();
        }
        chTitle = decodeHtmlEntities(chTitle).trim();

        if (!chTitle) {
            const chMatch = link.match(/_(\d+)\.html$/);
            chTitle = chMatch ? `Chapter ${chMatch[1]}` : "Chapter";
        }

        list.push({
            title: chTitle,
            link: link,
            text: ""
        });
    }
    return list;
}

const searchCache = new Map();

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
        const cacheKey = trimmed.toLowerCase();

        const seenLinks = new Set();
        let searchid = "";
        let maxSearchPage = 1;

        if (searchCache.has(cacheKey)) {
            const cached = searchCache.get(cacheKey);
            searchid = cached.searchid;
            maxSearchPage = cached.maxPage;
        }

        if (p === 1 || !searchid) {
            const postUrl = "https://www.fanmtl.com/e/search/index.php";
            const postBody = `keyboard=${encodeURIComponent(trimmed)}&show=title&tempid=1&tbname=news`;
            let resp = await http.post(postUrl, postBody, {
                "content-type": "application/x-www-form-urlencoded"
            });

            if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
                resp = await http.post(postUrl, postBody, {
                    "content-type": "application/x-www-form-urlencoded"
                });
            }

            if (!resp || resp.status !== 200 || !resp.body) {
                return [];
            }

            const $ = parseHtml(resp.body);

            // Extract searchid and max page from pagination links
            const pageLinks = $(".pagination a[href*='searchid='], .paging a[href*='searchid=']");
            for (const a of pageLinks) {
                const href = a.attr("href");
                const mId = href.match(/[?&]searchid=(\d+)/);
                if (mId && !searchid) {
                    searchid = mId[1];
                }
                const mPage = href.match(/[?&]page=(\d+)/);
                if (mPage) {
                    const pageIdx = parseInt(mPage[1], 10);
                    if (pageIdx + 1 > maxSearchPage) {
                        maxSearchPage = pageIdx + 1;
                    }
                }
            }

            if (searchid) {
                searchCache.set(cacheKey, { searchid, maxPage: maxSearchPage });
            }

            if (p === 1) {
                return parseSearchCards($, seenLinks);
            }
        }

        if (!searchid || p > maxSearchPage) {
            return [];
        }

        const pageIdx = p - 1;
        const pageUrl = `https://www.fanmtl.com/e/search/result/index.php?page=${pageIdx}&searchid=${searchid}`;
        let resp = await http.get(pageUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(pageUrl);
        }

        if (!resp || resp.status !== 200 || !resp.body) {
            return [];
        }

        const $ = parseHtml(resp.body);
        return parseSearchCards($, seenLinks);
    },

    /**
     * Retrieve novel metadata and chapter list.
     * @param {string} novelUrl - Full URL to novel overview page.
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
        // Input validation
        if (!novelUrl || typeof novelUrl !== "string") {
            throw new Error(`Invalid novel URL:=${novelUrl}`);
        }
        let cleanUrl = toAbsoluteUrl(novelUrl.split("?")[0].split("#")[0]);
        if (!cleanUrl) {
            throw new Error(`Invalid novel URL:=${novelUrl}`);
        }

        // Network request with retry backoff delay on 429 that is handled in HttpBridge
        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Extract query parameter value for the key wjm to use for pagination
        const slugMatch = cleanUrl.match(/\/novel\/([a-zA-Z0-9_-]+)/);
        // Extract wjm value from html
        let wjm = slugMatch ? slugMatch[1] : "";
        if (!wjm) {
            const wjmLink = $("#chpagedlist a[href*='wjm=']").first()?.attr("href") || "";
            const mWjm = wjmLink.match(/[?&]wjm=([a-zA-Z0-9_-]+)/);
            if (mWjm) {
                wjm = mWjm[1];
            }
        }

        // Title
        const titleEl = $("h1.novel-title, h1[itemprop='name'], h1").first();
        let title = titleEl ? titleEl.text().trim() : "";
        if (!title) {
            title = $("meta[property='og:title']").attr("content") || "";
            title = title.replace(/\s*Novel Read Online.*$/i, "").trim();
        }
        title = decodeHtmlEntities(title).trim();

        // Author
        let author = $("span[itemprop='author'], .author span[itemprop='author']").first()?.text()?.trim() ||
                     $(".author").first()?.text()?.trim() || "";
        author = author.replace(/^Author:\s*/i, "").trim();
        author = decodeHtmlEntities(author).trim();

        // Cover image
        const coverImg = $("figure.cover img, .fixed-img img, figure.novel-cover img").first();
        let imageUrl = "";
        if (coverImg) {
            const dataSrc = coverImg.attr("data-src")?.trim();
            const src = coverImg.attr("src")?.trim();
            if (dataSrc && !dataSrc.includes("placeholder-")) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src && !src.includes("placeholder-")) {
                imageUrl = toAbsoluteUrl(src);
            } else if (dataSrc) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src) {
                imageUrl = toAbsoluteUrl(src);
            }
        }
        if (!imageUrl) {
            const ogImg = $("meta[property='og:image']").attr("content") || "";
            if (ogImg && !ogImg.includes("placeholder-")) {
                imageUrl = toAbsoluteUrl(ogImg);
            }
        }

        // Status
        let status = "Ongoing";
        const statsSpans = $(".header-stats span, .novel-stats span");
        for (const sp of statsSpans) {
            const smallText = sp.first("small")?.text()?.trim() || "";
            if (/status/i.test(smallText)) {
                const s = sp.first("strong")?.text()?.trim();
                if (s) {
                    status = s;
                    break;
                }
            }
        }
        if (!status || status === "Ongoing") {
            const statsText = $(".header-stats, .novel-stats").text();
            if (/completed/i.test(statsText)) {
                status = "Completed";
            } else if (/ongoing/i.test(statsText)) {
                status = "Ongoing";
            } else if (/hiatus/i.test(statsText)) {
                status = "Hiatus";
            }
        }

        // Genres
        const genreElements = $(".categories a[href*='/list/'], .categories a.property-item");
        const genres = Array.from(new Set(
            genreElements.map(el => decodeHtmlEntities(el.text().trim())).filter(Boolean)
        )).join(", ");

        // Tags
        const tagElements = $(".tags a.tag, .categories a.tag, a.tag");
        const tags = Array.from(new Set(
            tagElements.map(el => decodeHtmlEntities(el.text().trim())).filter(Boolean)
        )).join(", ");

        // Description
        const descEl = $("#info .summary .content, .summary .content, #info .summary").first();
        let description = "";
        if (descEl) {
            description = cleanDescription(descEl.html()) || descEl.text().trim();
        }
        if (!description) {
            description = $("meta[name='description']").attr("content") || "";
        }
        description = decodeHtmlEntities(description).trim();

        // Chapters
        const chapters = [];
        const seenChapterLinks = new Set();
        chapters.push(...extractChapters($, seenChapterLinks));

        // Determine max page from pagination
        let maxPage = 0;
        const pageLinks = $("#chpagedlist .pagination a[href*='page=']");
        for (const a of pageLinks) {
            const href = a.attr("href");
            const m = href.match(/[?&]page=(\d+)/);
            if (m) {
                const p = parseInt(m[1], 10);
                if (p > maxPage) {
                    maxPage = p;
                }
            }
        }

        if (wjm && maxPage > 0) {
            const pageIndices = [];
            for (let p = 1; p <= maxPage; p++) {
                pageIndices.push(p);
            }

            const chunkSize = 5;
            for (let i = 0; i < pageIndices.length; i += chunkSize) {
                const chunk = pageIndices.slice(i, i + chunkSize);
                const chunkResponses = await Promise.all(
                    chunk.map(async (p) => {
                        const pageUrl = `https://www.fanmtl.com/e/extend/fy.php?page=${p}&wjm=${wjm}`;
                        for (let attempt = 0; attempt < 2; attempt++) {
                            try {
                                const res = await http.get(pageUrl);
                                if (res && res.status === 200 && res.body) {
                                    return { page: p, body: res.body };
                                }
                            } catch (e) {
                                console.warn(`Error fetching chapter page ${p} (attempt ${attempt + 1}): ` + e.message);
                            }
                        }
                        return { page: p, body: null };
                    })
                );

                for (const item of chunkResponses) {
                    if (item && item.body) {
                        const $page = parseHtml(item.body);
                        chapters.push(...extractChapters($page, seenChapterLinks));
                    }
                }
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
        // Input validation
        if (!chapterUrl || typeof chapterUrl !== "string" || !chapterUrl.trim()) return "";
        let cleanUrl = toAbsoluteUrl(chapterUrl.trim());
        if (!cleanUrl) return "";

        // Network request with retry backoff delay on 429 that is handled in HttpBridge
        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        // DOM parsing
        const $ = parseHtml(resp.body);
        const container = $("article#chapter-article div.chapter-content, div.chapter-content, article#chapter-article, #chapter-article").first();
        if (!container) {
            return "";
        }
        // Remove boilerplate, ads, navigation, notice elements
        container.remove("script, style, ins, iframe, noscript, .ads, .ad, .chapternav, .guide-message");

        // Paragraph selection
        const pElements = container.select("p");
        if (pElements.length > 0) {
            const paragraphs = pElements.map(p => decodeHtmlEntities(p.text().trim()))
                .filter(text => text.length > 0)
                .map(p => `<p>${p}</p>`)
                .join("");
            if(paragraphs) return paragraphs;
        }

        // Return empty as fallback because paragarphs could not be parsed
        return "";
    }
};
