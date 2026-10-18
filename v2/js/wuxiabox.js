/**
 * Source script for wuxiabox.com
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
    if (!clean || clean === "#" || clean === "https://" || clean === "http://" ||
        clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (clean.startsWith("wuxiabox.com") || clean.startsWith("www.wuxiabox.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://www.wuxiabox.com${clean.startsWith("/") ? "" : "/"}${clean}`;
    }

    clean = clean.replace(/^https?:\/\/wuxiabox\.com(\/|$)/i, "https://www.wuxiabox.com$1");

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
function extractNovelSlug(url) {
    if (!url || typeof url !== "string") return "";
    const clean = url.trim().split("?")[0].split("#")[0];
    const match = clean.match(/\/novel\/([a-zA-Z0-9_-]+?)(?:\.html|\/|$)/i);
    if (match) {
        return match[1].replace(/_\d+$/, "").trim();
    }
    if (!clean.includes("/") && !clean.includes(":") && clean.length > 0) {
        const bare = clean.replace(/\.html$/i, "").replace(/_\d+$/, "").trim();
        if (bare && bare !== "search" && bare !== "index" && bare !== "updates" && bare !== "list") {
            return bare;
        }
    }
    return "";
}

/**
 * Normalizes a novel overview URL by ensuring base path https://www.wuxiabox.com/novel/{slug}.html.
 * Returns empty string if the URL does not correspond to a valid novel path or slug.
 * @param {string} url
 * @returns {string}
 */
function normalizeNovelUrl(url) {
    if (!url || typeof url !== "string") return "";
    const slug = extractNovelSlug(url);
    if (slug) {
        return `https://www.wuxiabox.com/novel/${slug}.html`;
    }
    return "";
}

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
        .replace(/&hellip;|…/gi, "...")
        .replace(/&mdash;/gi, "—")
        .replace(/&ndash;/gi, "–")
        .replace(/&#(\d+);/g, (_, dec) => {
            try {
                const code = parseInt(dec, 10);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            try {
                const code = parseInt(hex, 16);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        });
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
    const items = $("ul.novel-list.grid li.novel-item, ul.novel-list li.novel-item, li.novel-item, .novel-item");

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

        let chTitle = "";
        const strongTitle = a.first("strong.chapter-title, .chapter-title")?.text()?.trim() || "";
        const titleAttr = a.attr("title")?.trim() || "";
        const chNo = a.first("span.chapter-no, .chapter-no")?.text()?.trim() || "";

        // Check if strongTitle has custom text beyond "Page X"
        if (strongTitle && !/^Page\s+\d+$/i.test(strongTitle)) {
            chTitle = strongTitle.replace(/^Page\s+(\d+)\s*[-:]\s*/i, "Chapter $1 - ");
        } else if (titleAttr) {
            const m = titleAttr.match(/(?:.*?\s+)?((?:Chapter|Ch\.|Ch|Episode)\s*\d+.*)$/i);
            if (m) {
                chTitle = m[1];
            }
        }

        // If chTitle is still empty or is just "Page X", check chNo or strongTitle
        if (!chTitle || /^Page\s+\d+$/i.test(chTitle)) {
            if (chNo) {
                chTitle = `Chapter ${chNo}`;
            } else if (strongTitle && /^Page\s+(\d+)$/i.test(strongTitle)) {
                chTitle = strongTitle.replace(/^Page\s+(\d+)$/i, "Chapter $1");
            } else {
                const timeEl = a.first("time");
                const timeText = timeEl ? timeEl.text() : "";
                const fallbackText = a.text().replace(timeText, "").trim();
                if (fallbackText && !/^Page\s+\d+$/i.test(fallbackText)) {
                    chTitle = fallbackText;
                } else if (titleAttr) {
                    chTitle = titleAttr;
                }
            }
        }

        if (!chTitle) {
            const chMatch = link.match(/_(\d+)\.html$/);
            chTitle = chMatch ? `Chapter ${chMatch[1]}` : "Chapter";
        }

        chTitle = decodeHtmlEntities(chTitle).trim();

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
            const postUrl = "https://www.wuxiabox.com/e/search/index.php";
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

            if (!searchid) {
                const hasCards = $("ul.novel-list.grid li.novel-item, ul.novel-list li.novel-item, li.novel-item, .novel-item").length > 0;
                maxSearchPage = hasCards ? 1 : 0;
            }
            searchCache.set(cacheKey, { searchid, maxPage: maxSearchPage });

            if (p === 1) {
                return parseSearchCards($, seenLinks);
            }
        }

        if (!searchid || p > maxSearchPage) {
            return [];
        }

        const pageIdx = p - 1;
        const pageUrl = `https://www.wuxiabox.com/e/search/result/index.php?page=${pageIdx}&searchid=${searchid}`;
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
     * @param {string} novelUrl - Full URL, relative path, or slug to novel overview page.
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
            throw new Error("Invalid novel URL");
        }

        const cleanUrl = normalizeNovelUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        let wjm = extractNovelSlug(cleanUrl);

        const $ = parseHtml(resp.body);

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
            title = title.replace(/\s*Novel Latest Chapter.*$/i, "").replace(/\s*Novel Full Story.*$/i, "").trim();
        }
        title = decodeHtmlEntities(title).trim();

        // Author
        let author = $("span[itemprop='author'], .author span[itemprop='author']").first()?.text()?.trim() ||
                     $(".author").first()?.text()?.trim() || "";
        author = author.replace(/^Author:\s*/i, "").trim();
        author = decodeHtmlEntities(author).trim();

        // Cover image
        const coverImg = $(".fixed-img figure.cover img, figure.cover img, .fixed-img img, figure.novel-cover img").first();
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
        const tagElements = $(".tags a.tag, .categories a.tag, .tags a, a.tag");
        const tags = Array.from(new Set(
            tagElements.map(el => decodeHtmlEntities(el.text().trim())).filter(Boolean)
        )).join(", ");

        // Description
        let descEl = $(".summary .content, #info .summary .content").first();
        if (!descEl) {
            descEl = $(".summary, #info .summary").first();
            if (descEl) {
                descEl.remove("h1, h2, h3, h4, h5, h6");
            }
        }
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
                        const pageUrl = `https://www.wuxiabox.com/e/extend/fy.php?page=${p}&wjm=${wjm}`;
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

                        const subLinks = $page("#chpagedlist .pagination a[href*='page=']");
                        for (const a of subLinks) {
                            const href = a.attr("href");
                            const m = href.match(/[?&]page=(\d+)/);
                            if (m) {
                                const p = parseInt(m[1], 10);
                                if (p > maxPage) {
                                    for (let np = maxPage + 1; np <= p; np++) {
                                        pageIndices.push(np);
                                    }
                                    maxPage = p;
                                }
                            }
                        }
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
        if (!chapterUrl || typeof chapterUrl !== "string" || !chapterUrl.trim() || chapterUrl.trim() === "#") {
            return "";
        }

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
        const container = $("article#chapter-article div.chapter-content, div.chapter-content, article#chapter-article, #chapter-article").first();
        if (!container) {
            return "";
        }

        // Remove boilerplate, ads, navigation, notice elements
        container.remove("script, style, ins, iframe, noscript, .ads, .ad, div[align='center'], div[id^='pf-'], div[id^='bg-ssp-'], div[class*='pubfuture'], div[id*='pubfuture'], .TPuhiHlg, .chapternav, .guide-message, .read-ads, .reader-ad-skip");

        const pElements = container.select("p");
        if (pElements.length > 0) {
            const paragraphs = [];
            for (const p of pElements) {
                const rawHtml = p.html();
                let text = "";
                if (rawHtml && /<br\s*[\/]?>/i.test(rawHtml)) {
                    text = decodeHtmlEntities(
                        rawHtml
                            .replace(/\s*<br\s*[\/]?>\s*<br\s*[\/]?>\s*/gi, "\n\n")
                            .replace(/\s*<br\s*[\/]?>\s*/gi, "\n")
                            .replace(/<[^>]+>/g, "")
                    ).trim();
                } else {
                    text = decodeHtmlEntities(p.text().trim());
                }
                if (!text) continue;
                paragraphs.push(text);
            }
            if (paragraphs.length > 0) {
                return paragraphs.map(p => `<p>${p}</p>`).join("");
            }
        }

        const rawHtml = container.html();
        if (rawHtml) {
            return cleanDescription(rawHtml);
        }

        return decodeHtmlEntities(container.text().trim());
    }
};
