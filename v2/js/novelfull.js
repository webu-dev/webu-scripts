/**
 * Source script for novelfull.com
 */
//@ts-check

/**
 * Normalizes a URL to be absolute with https and no double slashes in paths.
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
    } else if (clean.startsWith("novelfull.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://novelfull.com${clean.startsWith("/") ? "" : "/"}${clean}`;
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
        const searchUrl = `https://novelfull.com/search?keyword=${encodeURIComponent(trimmed)}&page=${page}`;

        let resp = await http.get(searchUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(searchUrl);
        }

        const results = [];
        const seenLinks = new Set();
        if (resp && resp.status === 200 && resp.body) {
            const $ = parseHtml(resp.body);

            const items = $("#list-page .row");
            for (const item of items) {
                const titleA = item.first(".truyen-title a, h3.truyen-title a");
                if (!titleA) continue;

                let href = titleA.attr("href");
                if (!href) continue;

                let link = toAbsoluteUrl(href);
                if (!link || seenLinks.has(link)) continue;

                let title = titleA.attr("title")?.trim() || titleA.text().trim();
                if (!title) continue;

                const imgE = item.first("img.cover, img");
                let imgSrc = imgE ? (imgE.attr("src") || imgE.attr("data-src") || imgE.attr("data-original") || "") : "";
                if (imgSrc) {
                    imgSrc = toAbsoluteUrl(imgSrc);
                }

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
        let title = $(".books .desc h3.title, .desc h3.title, h3.title, .col-info-desc h3.title").first()?.text().trim() || "";
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle.replace(/\s*online free.*$/i, "").replace(/^Read\s+/i, "").trim();
        }

        // Cover Image
        let imageUrl = $(".books .book img, .info-holder .book img, .book img, .books img").first()?.attr("src") ||
                       $(".books .book img, .info-holder .book img, .book img, .books img").first()?.attr("data-src") ||
                       $(".books .book img, .info-holder .book img, .book img, .books img").first()?.attr("data-original") || "";
        if (!imageUrl) {
            imageUrl = $("meta[name='image']").attr("content") || $("meta[property='og:image']").attr("content") || "";
        }
        if (imageUrl) {
            imageUrl = toAbsoluteUrl(imageUrl);
        }

        // Author
        let author = $(".info a[href*='/author/']").map(a => a.text().trim()).filter(Boolean).join(", ");
        if (!author) {
            const infoDivs = $(".info > div, .info div");
            for (const div of infoDivs) {
                const t = div.text();
                if (/author:/i.test(t)) {
                    author = t.replace(/^Author:\s*/i, "").trim();
                    break;
                }
            }
        }
        if (!author) {
            const metaDesc = $("meta[name='description']").attr("content") || "";
            const m = metaDesc.match(/author\s+([^,.]+)/i);
            if (m) author = m[1].trim();
        }

        // Status
        let status = $(".info a[href*='/status/']").first()?.text().trim() || "";
        if (!status) {
            const infoText = $(".info").text();
            if (/completed/i.test(infoText)) {
                status = "Completed";
            } else if (/ongoing/i.test(infoText)) {
                status = "Ongoing";
            }
        }

        // Genres
        const genreElements = $(".info a[href*='/genre/']");
        const genres = Array.from(new Set(
            genreElements.map(el => el.text().trim()).filter(Boolean)
        )).join(", ");

        // Tags & Alternative names
        const tagElements = $(".info a[href*='/tag/']");
        const tagsList = tagElements.map(el => el.text().trim()).filter(Boolean);
        const infoDivs = $(".info > div, .info div");
        for (const div of infoDivs) {
            const t = div.text();
            if (/alternative names?:/i.test(t)) {
                const alt = t.replace(/^Alternative names?:\s*/i, "").trim();
                if (alt) tagsList.push(alt);
            }
        }
        const tags = Array.from(new Set(tagsList)).join(", ");

        // Description
        let description = "";
        const descEl = $(".desc-text").first();
        if (descEl) {
            descEl.remove("script, style, iframe, .ads, .ad");
            const pElements = descEl.select("p");
            if (pElements.length > 0) {
                description = pElements.map(p => p.text().trim()).filter(Boolean).join("\n\n");
            } else {
                description = descEl.text().trim();
            }
        }
        if (!description) {
            description = ($("meta[name='description']").attr("content") || "").trim();
        }

        // Chapters
        const chapters = [];
        const seenChapterLinks = new Set();

        function addChapter(href, rawTitle) {
            if (!href) return;
            const link = toAbsoluteUrl(href);
            if (!link || seenChapterLinks.has(link) || link === baseUrl) return;
            // Exclude pagination URLs
            if (/[?&]page=\d+/i.test(link)) return;

            let chTitle = (rawTitle || "").trim();
            if (!chTitle) {
                const nameMatch = link.match(/\/(?:chapter|ch|c)[-_]?([^/?#.]+)/i);
                chTitle = nameMatch ? `Chapter ${nameMatch[1].replace(/[-_]/g, " ")}` : "Chapter";
            }

            seenChapterLinks.add(link);
            chapters.push({
                title: chTitle,
                link,
                text: ""
            });
        }

        // 1. Try AJAX chapter option endpoint
        let rawNovelId = $("input#truyen-id, input[name='truyen-id']").first()?.attr("value") ||
                         $("#rating").first()?.attr("data-novel-id") ||
                         $("[data-novel-id]").first()?.attr("data-novel-id") || "";
        if (!rawNovelId) {
            const idMatch = resp.body.match(/id="truyen-id"[^>]*value="(\d+)"/i) ||
                            resp.body.match(/value="(\d+)"[^>]*id="truyen-id"/i) ||
                            resp.body.match(/data-novel-id="(\d+)"/i);
            if (idMatch) rawNovelId = idMatch[1];
        }

        let novelId = "";
        if (rawNovelId) {
            const numMatch = String(rawNovelId).match(/\d+/);
            if (numMatch && numMatch[0] !== "0") {
                novelId = numMatch[0];
            }
        }

        if (novelId) {
            try {
                const ajaxUrl = `https://novelfull.com/ajax-chapter-option?novelId=${novelId}`;
                let chResp = await http.get(ajaxUrl);
                if ((!chResp || chResp.status !== 200) && (!chResp || chResp.status === 429 || chResp.status >= 500)) {
                    chResp = await http.get(ajaxUrl);
                }

                if (chResp && chResp.status === 200 && chResp.body) {
                    const $ch = parseHtml(chResp.body);
                    const options = $ch("option");
                    for (const opt of options) {
                        const href = opt.attr("value");
                        if (!href || href === "0" || href === "#" || href === "/" || href.startsWith("javascript:")) continue;
                        addChapter(href, opt.text());
                    }

                    // Also check for anchor tags if endpoint returned links
                    if (chapters.length === 0) {
                        const links = $ch("a");
                        for (const a of links) {
                            const href = a.attr("href");
                            if (!href || href === "0" || href === "#" || href === "/" || href.startsWith("javascript:")) continue;
                            addChapter(href, a.attr("title") || a.text());
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch chapters via ajax-chapter-option: " + e.message);
            }
        }

        // 2. Fallback to HTML parsing & pagination if AJAX returned no chapters
        if (chapters.length === 0) {
            function extractChaptersFromDoc(doc) {
                const links = doc("#list-chapter .list-chapter li a, ul.list-chapter li a, .list-chapter li a");
                for (const a of links) {
                    const href = a.attr("href");
                    if (!href) continue;
                    addChapter(href, a.attr("title") || a.text());
                }
            }

            extractChaptersFromDoc($);

            // Check total pages
            let totalPage = parseInt($("input#total-page").first()?.attr("value") || "1", 10);
            if (!totalPage || isNaN(totalPage) || totalPage < 1) {
                const lastHref = $(".pagination li.last a").first()?.attr("href") || "";
                const pm = lastHref.match(/[?&]page=(\d+)/);
                if (pm) totalPage = parseInt(pm[1], 10);
            }

            if (totalPage > 1) {
                const pageUrls = [];
                for (let p = 2; p <= totalPage; p++) {
                    pageUrls.push(`${baseUrl}?page=${p}`);
                }

                const chunkSize = 3;
                for (let i = 0; i < pageUrls.length; i += chunkSize) {
                    const chunk = pageUrls.slice(i, i + chunkSize);
                    try {
                        const responses = await Promise.all(
                            chunk.map(async (u) => {
                                for (let attempt = 0; attempt < 2; attempt++) {
                                    try {
                                        const r = await http.get(u);
                                        if (r && r.status === 200 && r.body) return r;
                                    } catch (e) {
                                        console.warn(`Error fetching ${u} (attempt ${attempt + 1}): ` + e.message);
                                    }
                                }
                                return null;
                            })
                        );
                        for (const r of responses) {
                            if (r && r.status === 200 && r.body) {
                                const $page = parseHtml(r.body);
                                extractChaptersFromDoc($page);
                            }
                        }
                    } catch (e) {
                        console.warn("Error fetching chunk of pages: " + e.message);
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
        const content = $("#chapter-content, .chapter-c, .chapter-content").first();
        if (!content) {
            return "";
        }
        // Clean any ad elements, iframes, scripts
        content.remove("iframe, script, style, .ads, .ad, noscript, div[align='center']");

        const paragraphs = content.select("p").map(p => p.text().trim())
            .filter(text => text.length > 0)
            .map(p => `<p>${p}</p>`)
            .join("");

        return paragraphs;
    }
};