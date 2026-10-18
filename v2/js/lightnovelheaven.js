/**
 * Source script for lightnovelheaven.com
 */
//@ts-check

/**
 * Normalizes a URL to be absolute with https and no duplicate slashes in paths.
 * Normalizes www.lightnovelheaven.com to lightnovelheaven.com.
 * Returns empty string for invalid, non-navigable, or javascript URLs.
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
    } else if (clean.startsWith("www.lightnovelheaven.com")) {
        clean = `https://${clean.slice(4)}`;
    } else if (clean.startsWith("lightnovelheaven.com")) {
        clean = `https://${clean}`;
    } else if (clean.startsWith("https://www.lightnovelheaven.com")) {
        clean = `https://lightnovelheaven.com${clean.slice(32)}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://lightnovelheaven.com${clean.startsWith("/") ? "" : "/"}${clean}`;
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
 * Checks if an image URL is a placeholder or blank data URI.
 * @param {string} url
 * @returns {boolean}
 */
function isPlaceholder(url) {
    if (!url || typeof url !== "string") return true;
    const lower = url.trim().toLowerCase();
    return !lower ||
        lower === "#" ||
        lower.startsWith("data:") ||
        lower.startsWith("javascript:") ||
        lower.includes("dflazy.jpg") ||
        lower.includes("lazyload") ||
        lower.includes("1x1.") ||
        lower.includes("placeholder");
}

/**
 * Resolves cover image URL from an img element, preferring lazy-load data attributes.
 * @param {any} imgEl
 * @returns {string}
 */
function extractImageUrl(imgEl) {
    if (!imgEl) return "";
    let src = imgEl.attr("data-src") ||
              imgEl.attr("data-lazy-src") ||
              imgEl.attr("data-original") ||
              imgEl.attr("data-cfsrc") || "";

    if (isPlaceholder(src)) {
        const srcset = imgEl.attr("data-srcset") || imgEl.attr("srcset") || "";
        if (srcset) {
            const first = srcset.split(",")[0].trim().split(/\s+/)[0];
            if (!isPlaceholder(first)) {
                src = first;
            }
        }
    }
    if (isPlaceholder(src)) {
        const rawSrc = imgEl.attr("src") || "";
        if (!isPlaceholder(rawSrc)) {
            src = rawSrc;
        }
    }
    return (!isPlaceholder(src)) ? toAbsoluteUrl(src) : "";
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
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const searchUrl = pageNum === 1
            ? `https://lightnovelheaven.com/?s=${encodeURIComponent(trimmed)}&post_type=wp-manga`
            : `https://lightnovelheaven.com/page/${pageNum}/?s=${encodeURIComponent(trimmed)}&post_type=wp-manga`;

        let resp = await http.get(searchUrl);
        if (resp && resp.status === 404) {
            return [];
        }
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(searchUrl);
            if (resp && resp.status === 404) {
                return [];
            }
        }

        const results = [];
        const seenLinks = new Set();
        if (resp && resp.status === 200 && resp.body) {
            const $ = parseHtml(resp.body);
            const items = $(".c-tabs-item__content, .search-wrap .row, .tab-content-wrap .row");

            for (const item of items) {
                const titleA = item.first(".post-title a, h3 a, h4 a");
                if (!titleA) continue;

                let href = titleA.attr("href");
                if (!href) continue;

                let link = toAbsoluteUrl(href);
                if (!link || seenLinks.has(link)) continue;

                titleA.remove(".manga-title-badges, span.label, span.badge, .rate-vote");
                let title = (titleA.attr("title") || titleA.text() || "").trim();
                if (!title) continue;

                const imgEl = item.first(".tab-thumb img, img");
                const imgSrc = extractImageUrl(imgEl);

                seenLinks.add(link);
                results.push({ title, link, imgSrc });
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

        const cleanUrl = toAbsoluteUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }
        const baseUrl = cleanUrl.split("?")[0].split("#")[0];

        let resp = await http.get(baseUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(baseUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        const titleEl = $(".post-title h1, h1").first();
        let title = "";
        if (titleEl) {
            titleEl.remove(".manga-title-badges, span.label, span.badge, .rate-vote");
            title = titleEl.text().trim();
        }
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle.replace(/\s*–\s*LightNovelHeaven.*$/i, "").replace(/\s*online free.*$/i, "").replace(/^Read\s+/i, "").trim();
        }

        // Cover image
        const imgEl = $(".summary_image img, .tab-summary img").first();
        let imageUrl = extractImageUrl(imgEl);
        if (!imageUrl) {
            const ogImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || "";
            if (!isPlaceholder(ogImg)) {
                imageUrl = toAbsoluteUrl(ogImg);
            }
        }

        // Author
        let author = Array.from(new Set(
            $(".author-content a").map(a => a.text().trim()).filter(Boolean)
        )).filter(name => !/^(?:n\/a|updating)$/i.test(name)).join(", ");

        if (!author) {
            const items = $(".post-content_item");
            for (const item of items) {
                const heading = item.first(".summary-heading h5, h5")?.text()?.trim() || "";
                if (/author/i.test(heading)) {
                    const authorLinks = item.select(".summary-content a, .summary-content")
                        .map(a => a.text().trim())
                        .filter(Boolean)
                        .filter(name => !/^(?:n\/a|updating)$/i.test(name));
                    author = Array.from(new Set(authorLinks)).join(", ");
                    if (author) break;
                }
            }
        }
        if (!author) {
            const metaDesc = $("meta[name='description']").attr("content") || "";
            const m = metaDesc.match(/author\s+([^,.]+)/i);
            if (m) author = m[1].trim();
        }

        // Genres
        let genres = Array.from(new Set(
            $(".genres-content a").map(a => a.text().trim()).filter(Boolean)
        )).join(", ");
        if (!genres) {
            const items = $(".post-content_item");
            for (const item of items) {
                const heading = item.first(".summary-heading h5, h5")?.text()?.trim() || "";
                if (/genre/i.test(heading)) {
                    genres = Array.from(new Set(
                        item.select(".summary-content a, .summary-content").map(a => a.text().trim()).filter(Boolean)
                    )).join(", ");
                    if (genres) break;
                }
            }
        }

        // Tags
        let tags = Array.from(new Set(
            $(".tags-content a").map(a => a.text().trim()).filter(Boolean)
        )).join(", ");
        if (!tags) {
            const items = $(".post-content_item");
            for (const item of items) {
                const heading = item.first(".summary-heading h5, h5")?.text()?.trim() || "";
                if (/tag/i.test(heading)) {
                    tags = Array.from(new Set(
                        item.select(".summary-content a, .summary-content").map(a => a.text().trim()).filter(Boolean)
                    )).join(", ");
                    if (tags) break;
                }
            }
        }

        // Status
        let status = "";
        const contentItems = $(".post-content_item");
        for (const item of contentItems) {
            const heading = item.first(".summary-heading h5, h5")?.text()?.trim() || "";
            if (/status/i.test(heading)) {
                const statusContent = item.first(".summary-content")?.text()?.trim() || "";
                if (statusContent && !/read\s+first|read\s+last/i.test(statusContent)) {
                    status = statusContent;
                    break;
                }
            }
        }
        if (!status || /read\s+first|read\s+last/i.test(status)) {
            const candidate = $(".post-status .summary-content").first()?.text()?.trim() || "";
            if (candidate && !/read\s+first|read\s+last/i.test(candidate)) {
                status = candidate;
            }
        }
        if (!status || /read\s+first|read\s+last/i.test(status)) {
            const pageText = $(".post-status, .tab-summary, .post-content, .tags-content").text();
            if (/completed/i.test(pageText)) {
                status = "Completed";
            } else if (/ongoing/i.test(pageText)) {
                status = "Ongoing";
            } else {
                status = "";
            }
        }

        // Description
        let description = "";
        let descEl = $(".description-summary .summary__content, .description-summary").first();
        if (!descEl) {
            descEl = $(".manga-excerpt, .c-page-content .entry-content, .entry-content_wrap").first();
        }
        if (!descEl) {
            descEl = $(".c-page-content, .panel-body").first();
        }
        if (descEl) {
            descEl.remove(".code-block, script, style, iframe, .ads, .ad, noscript, .sharedaddy");
            const pElements = descEl.select("p");
            if (pElements.length > 0) {
                description = pElements.map(p => p.text().trim())
                    .filter(t => t.length > 0 && !/^lightnovelheaven$/i.test(t))
                    .join("\n\n");
            } else {
                description = descEl.text().trim();
            }
        }
        if (!description) {
            description = ($("meta[name='description']").attr("content") || "").trim();
        }

        // Chapters
        const rawChapters = [];
        const seenLinks = new Set();
        const baseNorm = baseUrl.replace(/\/+$/, "");

        function extractChaptersFromDoc(doc) {
            const chLinks = doc(".wp-manga-chapter > a, li.wp-manga-chapter > a, .wp-manga-chapter a");
            for (const a of chLinks) {
                const href = a.attr("href");
                if (!href) continue;

                const link = toAbsoluteUrl(href.split("#")[0]);
                if (!link || seenLinks.has(link) || link.replace(/\/+$/, "") === baseNorm) continue;

                let chTitle = (a.attr("title") || a.text() || "").trim();
                if (!chTitle) {
                    const nameMatch = link.match(/\/(?:chapter|ch|c)[-_]?([^/?#.]+)/i);
                    chTitle = nameMatch ? `Chapter ${nameMatch[1].replace(/[-_]/g, " ")}` : "Chapter";
                }

                seenLinks.add(link);
                rawChapters.push({
                    title: chTitle,
                    link,
                    text: ""
                });
            }
        }

        // 1. Primary: from loaded page HTML
        extractChaptersFromDoc($);

        // 2. Fallback: if empty, query AJAX chapters endpoint
        if (rawChapters.length === 0) {
            try {
                const ajaxUrl = `${baseNorm}/ajax/chapters/`;
                let ajaxResp = await http.post(ajaxUrl);
                if ((!ajaxResp || ajaxResp.status !== 200) && (!ajaxResp || ajaxResp.status === 429 || ajaxResp.status >= 500)) {
                    ajaxResp = await http.post(ajaxUrl);
                }
                if (ajaxResp && ajaxResp.status === 200 && ajaxResp.body) {
                    const $ajax = parseHtml(ajaxResp.body);
                    extractChaptersFromDoc($ajax);
                }
            } catch (e) {
                console.warn("Error fetching ajax chapters: " + e.message);
            }
        }

        // Chapters on Light Novel Heaven are presented in reverse order (newest first).
        // Ensure chronological order (Chapter 1 first, Chapter N last).
        function parseChNum(item) {
            if (!item) return null;
            const mTitle = (item.title || "").match(/(?:chapter|ch|c|\b)\s*(\d+(?:\.\d+)?)/i);
            if (mTitle) return parseFloat(mTitle[1]);
            const mLink = (item.link || "").match(/(?:chapter|ch|c)[-_](\d+(?:\.\d+)?)/i);
            if (mLink) return parseFloat(mLink[1]);
            return null;
        }

        let chapters = rawChapters;
        if (rawChapters.length > 1) {
            const firstNum = parseChNum(rawChapters[0]);
            const lastNum = parseChNum(rawChapters[rawChapters.length - 1]);
            if (firstNum !== null && lastNum !== null) {
                if (firstNum > lastNum) {
                    chapters = rawChapters.reverse();
                }
            } else {
                // Default Madara ordering is descending (latest first)
                chapters = rawChapters.reverse();
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
        if (!chapterUrl || !chapterUrl.trim()) return "";
        const url = toAbsoluteUrl(chapterUrl);
        if (!url) return "";

        let resp = await http.get(url);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(url);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }
        const $ = parseHtml(resp.body);
        const content = $(".reading-content .text-left, .reading-content, .entry-content").first();
        if (!content) {
            return "";
        }
        // Clean ad elements, iframes, scripts, ins, navigation, and related reading blocks
        content.remove(".code-block, script, iframe, style, ins, .ads, .ad, noscript, div[align='center'], .related-reading-wrap, .related-reading-content, .chapter-nav, .nav-links, .select-pagination");

        const pElements = content.select("p");
        if (pElements.length > 0) {
            const paragraphs = pElements.map(p => p.text().trim())
                .filter(text => text.length > 0)
                .map(p => `<p>${p}</p>`)
                .join("");
            if (paragraphs) return paragraphs;
        }

        return content.text().trim();
    }
};
